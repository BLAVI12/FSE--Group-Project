import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  type TinkClient,
  jwtSubject,
  TinkError,
  accountsNeedingRelink,
  credentialsToRenew,
} from "../../supabase/functions/_shared/tink/client.ts";
import {
  toAccountValues,
  toCents,
  toTransactionValues,
  type TinkAccount,
} from "../../supabase/functions/_shared/tink/convert.ts";
import {
  planTransactions,
  type StoredTransaction,
  type TransactionPlan,
  type TransactionValues,
} from "../../supabase/functions/_shared/tink/reconcile.ts";
import {
  exactDecimal,
  classifyDescriptions,
} from "../../src/features/transactions/import-core.js";
import categoryMapping from "../../supabase/seed-data/transaction-categories.json" with { type: "json" };

const AUTO_INTERVAL_MS = 15 * 60_000;
const MANUAL_INTERVAL_MS = 60_000;

export class BankError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "BankError";
    this.code = code;
  }
}

interface Connection {
  id: string;
  tink_external_user_id: string;
  status: string;
  live_sync_enabled: boolean;
  sync_complete: boolean;
  last_synced: Date | null;
  sync_attempted_at: Date | null;
}

export interface SyncResult {
  status:
    | "synced"
    | "partial"
    | "current"
    | "busy"
    | "not_connected"
    | "expired"
    | "retry_later";
  lastSynced?: string | null;
  skippedTransactions?: number;
}

export interface BankStatus {
  connected: boolean;
  state:
    | "not_connected"
    | "syncing"
    | "synced"
    | "partial"
    | "error"
    | "expired";
  status?: string;
  liveSyncEnabled?: boolean;
  syncComplete?: boolean;
  lastSynced?: string | null;
  syncAttemptedAt?: string | null;
}

/** Both the signed-in user and the browser that started Link must match. */
export function validBrowserState(
  state: string | null,
  cookie: string | undefined,
) {
  if (
    !state ||
    !cookie ||
    !/^[a-f0-9]{64}$/.test(state) ||
    !/^[a-f0-9]{64}$/.test(cookie)
  )
    return false;
  return timingSafeEqual(Buffer.from(state), Buffer.from(cookie));
}

async function upsertAccount(
  db: PoolClient,
  userId: string,
  connectionId: string,
  account: TinkAccount,
) {
  const a = toAccountValues(account);
  const existing = (
    await db.query<{ id: string }>(
      `select id from public.accounts
      where user_id = $1 and (( $3::text is not null and iban = $3 )
        or (connection_id = $2 and provider_account_id = $4))
      order by (iban = $3) desc nulls last limit 1 for update`,
      [userId, connectionId, a.iban, a.providerAccountId],
    )
  ).rows[0];
  const values = [
    connectionId,
    a.providerAccountId,
    a.iban,
    a.name,
    a.type,
    a.balanceBooked,
    a.balanceAvailable,
    a.currency,
    a.lastRefreshed,
  ];
  if (existing) {
    await db.query(
      `update public.accounts set connection_id=$1, provider_account_id=$2,
      iban=$3, name=$4, type=$5, balance_booked=$6, balance_available=$7,
      currency=$8, last_refreshed=$9 where id=$10 and user_id=$11`,
      [...values, existing.id, userId],
    );
    return existing.id;
  }
  return (
    await db.query<{ id: string }>(
      `insert into public.accounts
    (connection_id,provider_account_id,iban,name,type,balance_booked,balance_available,currency,last_refreshed)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      values,
    )
  ).rows[0]!.id;
}

interface Rule {
  id: string;
  pattern?: string;
  keyword?: string;
  category_id?: string;
  category_name?: string;
}

async function applyPlan(
  db: PoolClient,
  userId: string,
  accountId: string,
  plan: TransactionPlan,
  categories: { id: string; name: string }[],
  exclusions: Rule[],
  rules: Rule[],
) {
  if (plan.deletes.length) {
    await db.query(
      `delete from public.transactions
      where user_id=$1 and account_id=$2 and status='PENDING' and id=any($3::uuid[])`,
      [userId, accountId, plan.deletes],
    );
  }
  if (plan.updates.length) {
    await db.query(
      `update public.transactions t set provider_transaction_id=v."providerTransactionId",
      amount=v.amount, amount_exact=v."amountExact", currency=v.currency, description=v.description,
      booked_date=v."bookedDate", status=v.status, is_transfer=v."isTransfer", occurrence=v.occurrence
      from jsonb_to_recordset($3::jsonb) as v(id uuid,"providerTransactionId" text,amount bigint,
        "amountExact" numeric,currency text,description text,"bookedDate" date,status text,"isTransfer" boolean,occurrence smallint)
      where t.id=v.id and t.user_id=$1 and t.account_id=$2`,
      [
        userId,
        accountId,
        JSON.stringify(plan.updates.map((u) => ({ id: u.id, ...u.values }))),
      ],
    );
  }
  if (plan.inserts.length) {
    const rows = plan.inserts.map((v) => {
      const classification = classifyDescriptions(
        v.description,
        v.description,
        categoryMapping,
        exclusions,
        rules,
      );
      const exclusion = classification.excluded
        ? exclusions.find(
            (r) =>
              r.id === classification.exclusionRuleId ||
              r.pattern === classification.exclusionPattern,
          )
        : undefined;
      if (classification.excluded && !exclusion)
        throw new BankError("MISSING_CATEGORY_SEED");
      return {
        ...v,
        category: classification.categoryName,
        exclusionId: exclusion?.id ?? null,
        categoryId:
          classification.categoryId ??
          categories.find((c) => c.name === classification.categoryName)?.id ??
          null,
        categoryRuleId: classification.categoryRuleId ?? null,
      };
    });
    await db.query(
      `with inserted as (
      insert into public.transactions (account_id,provider_transaction_id,amount,amount_exact,currency,
        description,booked_date,status,is_transfer,occurrence,source,category,is_excluded,exclusion_rule_id)
      select $2,v."providerTransactionId",v.amount,v."amountExact",v.currency,v.description,
        v."bookedDate",v.status,v."isTransfer",v.occurrence,'tink',v.category,v."exclusionId" is not null,v."exclusionId"
      from jsonb_to_recordset($3::jsonb) as v("providerTransactionId" text,amount bigint,"amountExact" numeric,
        currency text,description text,"bookedDate" date,status text,"isTransfer" boolean,occurrence smallint,
        category text,"exclusionId" uuid,"categoryId" uuid,"categoryRuleId" uuid)
      returning id,user_id,provider_transaction_id,booked_date,amount,description,occurrence)
      insert into public.category_assignments (user_id,transaction_id,category_id,category_rule_id,assignment_source)
      select i.user_id,i.id,v."categoryId",v."categoryRuleId",'automatic' from inserted i
      join jsonb_to_recordset($3::jsonb) as v("providerTransactionId" text,"bookedDate" date,amount bigint,
        description text,occurrence smallint,"categoryId" uuid,"categoryRuleId" uuid)
        on i.provider_transaction_id=v."providerTransactionId" and i.booked_date=v."bookedDate"
        and i.amount=v.amount and i.description=v.description and i.occurrence=v.occurrence
      where i.user_id=$1 and v."categoryId" is not null`,
      [userId, accountId, JSON.stringify(rows)],
    );
  }
}

/** Uses the existing tables and reconciliation rules; no background worker. */
export function createBankWorkflow(
  pool: Pick<Pool, "connect" | "query">,
  tink: TinkClient,
  now = Date.now,
) {
  return {
    async status(userId: string): Promise<BankStatus> {
      const connection = (
        await pool.query<Connection>(
          "select * from public.connections where user_id=$1 and provider='tink'",
          [userId],
        )
      ).rows[0];
      if (!connection?.live_sync_enabled) {
        return { connected: false, state: "not_connected" };
      }
      const lastSynced = connection.last_synced?.toISOString() ?? null;
      const syncAttemptedAt = connection.sync_attempted_at?.toISOString() ?? null;
      const finishedAttempt = Boolean(
        connection.last_synced &&
          connection.sync_attempted_at &&
          connection.last_synced.valueOf() >= connection.sync_attempted_at.valueOf(),
      );
      const state: BankStatus["state"] =
        connection.status === "EXPIRED"
          ? "expired"
          : connection.status === "ERROR"
            ? "error"
            : connection.sync_complete
              ? "synced"
              : finishedAttempt
                ? "partial"
                : "syncing";
      return {
        connected: true,
        state,
        status: connection.status,
        liveSyncEnabled: connection.live_sync_enabled,
        syncComplete: connection.sync_complete,
        lastSynced,
        syncAttemptedAt,
      };
    },

    async startConnect(userId: string, email: string, renew = false) {
      const connection = (
        await pool.query<Connection>(
          "select * from public.connections where user_id=$1 and provider='tink'",
          [userId],
        )
      ).rows[0];
      const externalId = connection?.tink_external_user_id ?? userId;
      let credentialsId: string | null = null;
      if (renew) {
        if (!connection?.live_sync_enabled)
          throw new BankError("NOT_CONNECTED");
        const ids = (
          await pool.query<{ provider_account_id: string }>(
            "select provider_account_id from public.accounts where connection_id=$1 and user_id=$2",
            [connection.id, userId],
          )
        ).rows.map((a) => a.provider_account_id);
        const token = await tink.userAccessToken(externalId);
        credentialsId = credentialsToRenew(
          await tink.fetchProviderConsents(token),
          ids,
          now(),
        );
        if (!credentialsId) throw new BankError("NOTHING_TO_RENEW");
      }
      const code = await tink.tinkLinkCode(externalId, email);
      if (!renew) {
        try {
          await tink.removeFailedLogins(externalId);
        } catch {
          /* New users and unavailable cleanup must not block Link. */
        }
      }
      const state = randomBytes(32).toString("hex");
      await pool.query(
        "delete from public.oauth_states where user_id=$1 and expires_at < now()",
        [userId],
      );
      await pool.query(
        `insert into public.oauth_states (state,user_id,tink_external_user_id,expires_at)
        values ($1,$2,$3,now()+interval '10 minutes')`,
        [state, userId, externalId],
      );
      return {
        state,
        redirectUrl: credentialsId
          ? tink.updateConsentUrl(code, credentialsId, state)
          : tink.tinkLinkUrl(code, state),
      };
    },

    async finishConnect(
      userId: string,
      params: URLSearchParams,
      cookieState: string | undefined,
    ) {
      const state = params.get("state");
      if (!validBrowserState(state, cookieState))
        throw new BankError("INVALID_STATE");
      const saved = (
        await pool.query<{ tink_external_user_id: string }>(
          `update public.oauth_states
        set consumed_at=now() where state=$1 and user_id=$2 and consumed_at is null and expires_at>now()
        returning tink_external_user_id`,
          [state, userId],
        )
      ).rows[0];
      if (!saved) throw new BankError("INVALID_STATE");
      const error = params.get("error") ?? params.get("error_reason");
      if (error === "USER_CANCELLED") return "cancelled";
      if (error) throw new BankError("LINK_FAILED");
      if (!params.get("credentials_id"))
        throw new BankError("INVALID_CALLBACK");
      // Always grant for the saved user; never trust a callback code to choose ownership.
      const token = await tink.userAccessToken(saved.tink_external_user_id);
      const accounts = await tink.fetchAccounts(token);
      if (!accounts.length) throw new BankError("NO_ACCOUNTS");
      const db = await pool.connect();
      try {
        await db.query("begin");
        const connection = (
          await db.query<{ id: string }>(
            `insert into public.connections
          (user_id,provider,tink_user_id,tink_external_user_id,status,sync_complete,live_sync_enabled)
          values ($1,'tink',$2,$3,'ACTIVE',false,true)
          on conflict (user_id,provider) do update set tink_user_id=coalesce(excluded.tink_user_id,connections.tink_user_id),
          tink_external_user_id=excluded.tink_external_user_id,status='ACTIVE',sync_complete=false,
          live_sync_enabled=true,sync_attempted_at=null returning id`,
            [userId, jwtSubject(token), saved.tink_external_user_id],
          )
        ).rows[0]!;
        for (const account of accounts)
          await upsertAccount(db, userId, connection.id, account);
        await db.query("commit");
        return "connected";
      } catch (error) {
        await db.query("rollback");
        throw error;
      } finally {
        db.release();
      }
    },

    async sync(userId: string, manual = false): Promise<SyncResult> {
      const db = await pool.connect();
      try {
        await db.query("begin");
        // PostgreSQL coordinates all app instances; concurrent clicks do not start another fetch.
        const connection = (
          await db.query<Connection>(
            `select * from public.connections
          where user_id=$1 and provider='tink' and live_sync_enabled for update skip locked`,
            [userId],
          )
        ).rows[0];
        if (!connection) {
          const exists = (
            await db.query(
              "select id from public.connections where user_id=$1 and provider='tink' and live_sync_enabled",
              [userId],
            )
          ).rows.length;
          await db.query("commit");
          return { status: exists ? "busy" : "not_connected" };
        }
        if (connection.status === "EXPIRED") {
          await db.query("commit");
          return { status: "expired" };
        }
        const lastSynced = connection.last_synced?.toISOString() ?? null;
        const sinceAttempt =
          now() - (connection.sync_attempted_at?.valueOf() ?? 0);
        const interval = manual ? MANUAL_INTERVAL_MS : AUTO_INTERVAL_MS;
        if (
          sinceAttempt < interval ||
          (!manual &&
            connection.sync_complete &&
            connection.last_synced &&
            now() - connection.last_synced.valueOf() < interval)
        ) {
          await db.query("commit");
          return {
            status: connection.status === "ERROR"
              ? "retry_later"
              : !connection.sync_complete && connection.last_synced
                ? "partial"
                : "current",
            lastSynced,
          };
        }
        await db.query(
          "update public.connections set sync_attempted_at=now() where id=$1",
          [connection.id],
        );
        await db.query("savepoint bank_data");
        try {
          const token = await tink.userAccessToken(
            connection.tink_external_user_id,
          );
          const [accounts, transactions, consents] = await Promise.all([
            tink.fetchAccounts(token),
            tink.fetchAllTransactions(token),
            tink.fetchProviderConsents(token),
          ]);
          if (!accounts.length) throw new BankError("NO_ACCOUNTS");
          const providerToLocal = new Map<string, string>();
          for (const account of accounts)
            providerToLocal.set(
              account.id,
              await upsertAccount(db, userId, connection.id, account),
            );
          const incoming = new Map<string, TransactionValues[]>();
          let skippedTransactions = 0;
          const skippedReasons = {
            unknownAccount: 0,
            missingProviderId: 0,
            missingBookedDate: 0,
            invalidAmount: 0,
          };
          for (const transaction of transactions) {
            const accountId = providerToLocal.get(transaction.accountId);
            if (!accountId) {
              skippedTransactions++;
              skippedReasons.unknownAccount++;
              continue;
            }
            const converted = toTransactionValues(transaction);
            // Follow the proven importer: do not invent missing transaction fields.
            // Usable rows may still be saved; pending deletion is disabled below.
            if (!converted) {
              skippedTransactions++;
              if (!transaction.identifiers?.providerTransactionId)
                skippedReasons.missingProviderId++;
              if (!transaction.dates?.booked)
                skippedReasons.missingBookedDate++;
              if (toCents(transaction.amount?.value) === null)
                skippedReasons.invalidAmount++;
              continue;
            }
            const amount = transaction.amount!.value!;
            const values = {
              ...converted.values,
              amountExact: exactDecimal(
                amount.unscaledValue,
                Number(amount.scale),
              ),
            };
            const list = incoming.get(accountId) ?? [];
            list.push(values);
            incoming.set(accountId, list);
          }
          const categories = (
            await db.query<{ id: string; name: string }>(
              "select id,name from public.categories where user_id is null or user_id=$1",
              [userId],
            )
          ).rows;
          const exclusions = (
            await db.query<Rule>(
              "select * from public.exclusion_rules where active and (user_id is null or user_id=$1)",
              [userId],
            )
          ).rows;
          const rules = (
            await db.query<Rule>(
              `select r.*,c.name as category_name from public.category_rules r
            join public.categories c on c.id=r.category_id where r.active and r.user_id=$1`,
              [userId],
            )
          ).rows;
          for (const accountId of new Set(providerToLocal.values())) {
            const stored = (
              await db.query<StoredTransaction>(
                `select id,provider_transaction_id as "providerTransactionId",
              amount,trim_scale(amount_exact)::text as "amountExact",currency,description,booked_date::text as "bookedDate",
              status,is_transfer as "isTransfer",occurrence from public.transactions where user_id=$1 and account_id=$2`,
                [userId, accountId],
              )
            ).rows;
            const plan = planTransactions(stored, incoming.get(accountId) ?? []);
            // A skipped row may be a stored pending transaction. Its absence
            // from the usable subset must never be treated as a bank deletion.
            if (skippedTransactions > 0) plan.deletes = [];
            await applyPlan(
              db,
              userId,
              accountId,
              plan,
              categories,
              exclusions,
              rules,
            );
          }
          const expired =
            accountsNeedingRelink(
              consents,
              accounts.map((a) => a.id),
              now(),
            ).length > 0;
          const complete = skippedTransactions === 0;
          const updated = (
            await db.query<{ last_synced: Date }>(
              `update public.connections set status=$2,
            sync_complete=$3,sync_cursor=null,last_synced=now() where id=$1 returning last_synced`,
              [connection.id, expired ? "EXPIRED" : "ACTIVE", complete],
            )
          ).rows[0]!;
          await db.query("commit");
          if (!complete) {
            // Counts only: never log transaction contents, bank credentials or tokens.
            console.warn("Bank sync saved a partial snapshot.", {
              receivedTransactions: transactions.length,
              usableTransactions: transactions.length - skippedTransactions,
              skippedTransactions,
              skippedReasons,
            });
          }
          return {
            status: expired ? "expired" : complete ? "synced" : "partial",
            lastSynced: updated.last_synced.toISOString(),
            ...(complete ? {} : { skippedTransactions }),
          };
        } catch (error) {
          // Roll back every bank-data change, but retain the attempt time to limit retries.
          await db.query("rollback to savepoint bank_data");
          await db.query(
            "update public.connections set status=$2,sync_complete=false where id=$1",
            [
              connection.id,
              error instanceof TinkError && error.status === 401
                ? "EXPIRED"
                : "ERROR",
            ],
          );
          await db.query("commit");
          throw error;
        }
      } catch (error) {
        await db.query("rollback");
        throw error;
      } finally {
        db.release();
      }
    },
  };
}
