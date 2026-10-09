import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test, { before, after, beforeEach } from "node:test";
import type { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { createTinkClient, type TinkClient, type TinkConfig, TinkError, accountsNeedingRelink, credentialsToRenew, failedLoginsToRemove } from "../../supabase/functions/_shared/tink/client.ts";
import type {
  TinkAccount,
  TinkTransaction,
} from "../../supabase/functions/_shared/tink/convert.ts";
import { createBankWorkflow, validBrowserState } from "../lib/tink.ts";
import { bankErrorDetails } from "../lib/bank-error.ts";

// Real PostgreSQL SQL semantics, with an in-memory database and fake Tink only.
const db = new PGlite({ parsers: { 20: Number, 1082: (value) => value } });
const pool = {
  query: (sql: string, values?: unknown[]) => db.query(sql, values),
  connect: async () => ({
    query: (sql: string, values?: unknown[]) => db.query(sql, values),
    release() {},
  }),
} as unknown as Pool;

let nextUser = 1;
async function user() {
  const id = `00000000-0000-4000-8000-${String(nextUser++).padStart(12, "0")}`;
  await db.query("insert into auth.users (id,email) values ($1,$2)", [
    id,
    `${id}@example.com`,
  ]);
  return id;
}

function account(id = "giro", iban = "DE001", balance = "10000"): TinkAccount {
  return {
    id,
    name: id,
    type: "CHECKING",
    identifiers: { iban: { iban } },
    balances: {
      booked: {
        amount: {
          value: { unscaledValue: balance, scale: "2" },
          currencyCode: "EUR",
        },
      },
    },
  };
}

function transaction(
  id = "1",
  description = "Edeka",
  status = "BOOKED",
  amount = "-249",
): TinkTransaction {
  return {
    id: `tx-${id}`,
    accountId: "giro",
    identifiers: { providerTransactionId: id },
    amount: {
      value: { unscaledValue: amount, scale: "2" },
      currencyCode: "EUR",
    },
    dates: { booked: "2026-10-01" },
    descriptions: { display: description },
    status,
  };
}

function fake() {
  const snapshot = {
    accounts: [account()],
    transactions: [transaction()],
    consents: [
      { credentialsId: "cred", accountIds: ["giro"], status: "UPDATED" },
    ],
    failTransactions: false,
    bankTransactions: null as TinkTransaction[] | null,
    refreshes: [] as string[],
    refreshUsers: [] as string[],
    refreshFailure: false,
    refreshStatus: "UPDATED",
    credentialUpdated: 1,
    credentialStatus: "UPDATED",
    missingUser: null as string | null,
    createdUsers: [] as string[],
    calls: 0,
  };
  const tink = createTinkClient(
    {
      clientId: "fake-id",
      clientSecret: "fake-secret",
      redirectUri: "http://localhost:3000/api/tink",
      market: "DE",
      locale: "en_US",
      testMode: true,
      timeoutMs: 1000,
    },
    {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        assert.equal(url.origin, "https://api.tink.com");
        snapshot.calls++;
        let body: unknown;
        if (url.pathname === "/api/v1/oauth/token")
          body = { access_token: "opaque-test-token", expires_in: 1800 };
        else if (url.pathname.includes("authorization-grant")) {
          const form = init?.body as URLSearchParams;
          if (form.get("external_user_id") === snapshot.missingUser)
            return Response.json({ errorCode: "USER_NOT_FOUND" }, { status: 404 });
          if (form.get("scope")?.includes("credentials:refresh") && !form.has("actor_client_id"))
            snapshot.refreshUsers.push(form.get("external_user_id")!);
          body = { code: "fake-code" };
        }
        else if (url.pathname === "/api/v1/user/create") {
          const externalId = JSON.parse(String(init?.body)).external_user_id as string;
          snapshot.createdUsers.push(externalId);
          if (snapshot.missingUser === externalId) snapshot.missingUser = null;
          body = { id: "new-tink-user" };
        }
        else if (url.pathname === "/api/v1/provider-consents")
          body = { providerConsents: snapshot.consents };
        else if (url.pathname === "/data/v2/accounts")
          body = { accounts: snapshot.accounts };
        else if (url.pathname === "/api/v1/credentials/cred")
          body = { id: "cred", status: snapshot.credentialStatus, updated: snapshot.credentialUpdated };
        else if (url.pathname === "/api/v1/credentials/cred/refresh") {
          assert.equal(init?.method, "POST");
          assert.equal(url.searchParams.get("authenticate"), "false");
          snapshot.refreshes.push("cred");
          if (snapshot.refreshFailure) return Response.json({ error: "REFRESH_NOT_ALLOWED" }, { status: 403 });
          snapshot.credentialUpdated++;
          snapshot.credentialStatus = snapshot.refreshStatus;
          if (snapshot.bankTransactions) snapshot.transactions = snapshot.bankTransactions;
          return new Response(null, { status: 204 });
        }
        else if (url.pathname === "/data/v2/transactions") {
          if (snapshot.failTransactions)
            return new Response("{}", { status: 503 });
          body = { transactions: snapshot.transactions };
        } else throw new Error(`unexpected fake endpoint ${url.pathname}`);
        return Response.json(body);
      },
    },
  );
  return { snapshot, tink, workflow: createBankWorkflow(pool, tink) };
}

async function connect(
  id: string,
  workflow: ReturnType<typeof createBankWorkflow>,
) {
  const link = await workflow.startConnect(id, "student@example.com");
  assert.equal(
    await workflow.finishConnect(
      id,
      new URLSearchParams({ state: link.state, credentials_id: "cred" }),
      link.state,
    ),
    "connected",
  );
  return link;
}

async function due(id: string) {
  await db.query(
    "update public.connections set sync_attempted_at=now()-interval '20 minutes',last_synced=now()-interval '20 minutes' where user_id=$1",
    [id],
  );
}

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    create table auth.users (id uuid primary key,instance_id uuid,aud text,role text,email text,
      encrypted_password text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb,
      created_at timestamptz,updated_at timestamptz,last_sign_in_at timestamptz,confirmation_token text,recovery_token text,email_change text,email_change_token_new text);
    create table auth.identities (id uuid primary key,provider_id text,user_id uuid,identity_data jsonb,
      provider text,created_at timestamptz,updated_at timestamptz,unique(provider_id,provider));`);
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(dir))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await db.exec(await readFile(new URL(file, dir), "utf8"));
  }
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/seeds/transaction-categories.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
});
after(async () => {
  await db.close();
});

test("authenticated database reads expose only the signed-in user's rows and block raw data and amount edits", async () => {
  const id = await user();
  const other = await user();
  const { workflow } = fake();
  await connect(id, workflow);
  await workflow.sync(id);
  const firstFingerprint = (await workflow.status(id)).transactionFingerprint;
  assert.ok(firstFingerprint);
  await connect(other, workflow);
  await workflow.sync(other);
  assert.equal((await workflow.status(id)).transactionFingerprint, firstFingerprint);
  await db.exec("begin; set local role authenticated");
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    const accounts = (
      await db.query<{ user_id: string }>("select user_id from accounts")
    ).rows;
    const transactions = (
      await db.query<{ user_id: string }>("select user_id from transactions")
    ).rows;
    assert.equal(accounts.length, 1);
    assert.equal(transactions.length, 1);
    assert.equal(accounts[0]!.user_id, id);
    assert.equal(transactions[0]!.user_id, id);
    await assert.rejects(db.query("select raw_payload from transactions"), {
      code: "42501",
    });
  } finally {
    await db.exec("rollback");
  }
  await db.exec("begin; set local role authenticated");
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    await assert.rejects(db.query("update transactions set amount=0"), {
      code: "42501",
    });
  } finally {
    await db.exec("rollback");
  }
});

test("profiles and roles are created automatically and cannot be escalated by users", async () => {
  const id = await user();
  const other = await user();

  const createdProfile = (
    await db.query<{ id: string }>("select id from profiles where id=$1", [id])
  ).rows[0];
  const createdRole = (
    await db.query<{ role: string }>(
      "select role from user_roles where user_id=$1",
      [id],
    )
  ).rows[0];
  assert.equal(createdProfile?.id, id);
  assert.equal(createdRole?.role, "user");

  await db.exec("begin; set local role authenticated");
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    const ownUpdate = await db.query<{ username: string }>(
      "update profiles set username='student_one' where id=$1 returning username",
      [id],
    );
    assert.equal(ownUpdate.rows[0]?.username, "student_one");

    const otherUpdate = await db.query(
      "update profiles set username='stolen_name' where id=$1 returning id",
      [other],
    );
    assert.equal(otherUpdate.rows.length, 0);

  } finally {
    await db.exec("rollback");
  }

  await db.query("update user_roles set role='admin' where user_id=$1", [id]);

  await db.exec("begin; set local role authenticated");
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    const profiles = await db.query<{ id: string }>("select id from profiles");
    assert.equal(profiles.rows.some((profile) => profile.id === other), true);

    await db.query("select admin_manage_user($1,'role','admin','Test promotion')", [other]);
    assert.equal((await db.query<{ role: string }>("select role from user_roles where user_id=$1", [other])).rows[0].role, "admin");
  } finally {
    await db.exec("rollback");
  }
});

test("admin suspension blocks existing sessions and RPCs, logs changes, and forbids bypasses", async () => {
  const admin = await user();
  const target = await user();
  const { workflow } = fake();
  await connect(target, workflow);
  await workflow.sync(target);
  await db.query("update user_roles set role='admin' where user_id=$1", [admin]);
  async function asUser<T>(id: string, fn: () => Promise<T>): Promise<T> {
    await db.exec("begin; set local role authenticated");
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
      const result = await fn();
      await db.exec("commit");
      return result;
    } catch (error) { await db.exec("rollback"); throw error; }
  }
  await assert.rejects(asUser(target, () => db.query("select admin_manage_user($1,'role','admin','Escalation')", [target])), /admin required/);
  await assert.rejects(asUser(admin, () => db.query("select admin_manage_user($1,'status','suspended','Self')", [admin])), /self changes forbidden/);
  await assert.rejects(asUser(admin, () => db.query("update user_roles set status='suspended' where user_id=$1", [target])), /permission denied/);
  await assert.rejects(asUser(target, () => db.query("update user_roles set role='admin' where user_id=$1", [target])), /permission denied/);
  await assert.rejects(asUser(target, () => db.query("select * from admin_list_users()")), /admin required/);
  await assert.rejects(asUser(admin, () => db.query("select admin_manage_user($1,'status','suspended','   ')", [target])), /reason required/);
  await asUser(admin, () => db.query("select admin_manage_user($1,'status','suspended','Access paused')", [target]));
  await asUser(target, async () => {
    assert.equal((await db.query<{ active: boolean }>("select is_account_active() as active")).rows[0].active, false);
    for (const table of ["profiles", "user_roles", "accounts", "transactions", "categories", "admin_audit_log"]) {
      const column = table === "user_roles" ? "user_id" : "id";
      assert.equal((await db.query(`select ${column} from ${table}`)).rows.length, 0);
    }
  });
  await assert.rejects(asUser(target, () => db.query("select set_transaction_category(gen_random_uuid(),null)")), /active account required/);
  await assert.rejects(asUser(target, () => db.query("select set_transaction_category_internal(gen_random_uuid(),null)")), /permission denied/);
  await asUser(admin, async () => {
    assert.equal((await db.query("select id from transactions where user_id=$1", [target])).rows.length, 0);
    const listed = await db.query<{ status: string; total: number }>("select * from admin_list_users('', '', 'suspended', 1)");
    assert.ok(listed.rows.some(r => r.status === "suspended"));
    assert.ok(listed.rows.length <= 20);
    const audit = await db.query<{ actor_id: string; new_value: string }>("select * from admin_audit_log where target_id=$1", [target]);
    assert.equal(audit.rows[0].actor_id, admin);
    assert.equal(audit.rows[0].new_value, "suspended");
  });
  await assert.rejects(asUser(admin, () => db.query("delete from admin_audit_log where target_id=$1", [target])), /permission denied/);
  await asUser(admin, () => db.query("select admin_manage_user($1,'status','active','Access restored')", [target]));
  await asUser(target, async () => {
    assert.equal((await db.query<{ active: boolean }>("select is_account_active() as active")).rows[0].active, true);
    assert.ok((await db.query("select id from transactions")).rows.length > 0);
  });
});

test("browser-state validation rejects absent, mismatched and malformed states", () => {
  assert.equal(validBrowserState("a".repeat(64), "a".repeat(64)), true);
  assert.equal(validBrowserState("a".repeat(64), "b".repeat(64)), false);
  assert.equal(validBrowserState(null, undefined), false);
  assert.equal(validBrowserState("short", "short"), false);
});

test("continuous-access callback needs no authorization code and is single-use and user-scoped", async () => {
  const id = await user();
  const other = await user();
  const { workflow } = fake();
  const link = await workflow.startConnect(id, "student@example.com");
  const params = new URLSearchParams({
    state: link.state,
    credentials_id: "cred",
  });
  await assert.rejects(workflow.finishConnect(other, params, link.state), {
    code: "INVALID_STATE",
  });
  assert.equal(
    await workflow.finishConnect(id, params, link.state),
    "connected",
  );
  await assert.rejects(workflow.finishConnect(id, params, link.state), {
    code: "INVALID_STATE",
  });
  const result = await db.query<{ live_sync_enabled: boolean }>(
    "select live_sync_enabled from connections where user_id=$1",
    [id],
  );
  assert.equal(result.rows[0]?.live_sync_enabled, true);
});

test("expired state and cancellation do not create a connection", async () => {
  const id = await user();
  const { workflow } = fake();
  const expired = await workflow.startConnect(id, "student@example.com");
  await db.query(
    "update oauth_states set expires_at=now()-interval '1 minute' where state=$1",
    [expired.state],
  );
  await assert.rejects(
    workflow.finishConnect(
      id,
      new URLSearchParams({ state: expired.state, credentials_id: "cred" }),
      expired.state,
    ),
    { code: "INVALID_STATE" },
  );
  const cancelled = await workflow.startConnect(id, "student@example.com");
  assert.equal(
    await workflow.finishConnect(
      id,
      new URLSearchParams({ state: cancelled.state, error: "USER_CANCELLED" }),
      cancelled.state,
    ),
    "cancelled",
  );
  assert.equal(
    (await db.query("select id from connections where user_id=$1", [id])).rows
      .length,
    0,
  );
});

test("sync imports exact amounts, categorises new rows, preserves categories and avoids duplicate renumbered transactions", async () => {
  const id = await user();
  const { workflow, snapshot } = fake();
  snapshot.transactions[0]!.amount!.value = {
    unscaledValue: "-2495",
    scale: "3",
  };
  await connect(id, workflow);
  assert.equal((await workflow.sync(id)).status, "synced");
  const before = (
    await db.query<{
      id: string;
      amount: number;
      amount_exact: string;
      category: string;
    }>(
      "select id,amount,amount_exact::text,category from transactions where user_id=$1",
      [id],
    )
  ).rows[0]!;
  assert.equal(before.amount, -250);
  assert.equal(before.amount_exact, "-2.495");
  assert.equal(before.category, "Groceries");
  await db.query("update transactions set category='My category' where id=$1", [
    before.id,
  ]);
  snapshot.transactions[0]!.identifiers!.providerTransactionId = "2";
  await due(id);
  assert.equal((await workflow.sync(id)).status, "synced");
  const after = (
    await db.query<{
      id: string;
      category: string;
      provider_transaction_id: string;
    }>(
      "select id,category,provider_transaction_id from transactions where user_id=$1",
      [id],
    )
  ).rows;
  assert.equal(after.length, 1);
  assert.equal(after[0]!.id, before.id);
  assert.equal(after[0]!.category, "My category");
  assert.equal(after[0]!.provider_transaction_id, "2");
});

test("manual refresh saves changed bank transactions in place and reports unchanged repeats", async (context) => {
  const logged = context.mock.method(console, "info", () => {});
  const id = await user();
  const { workflow, snapshot } = fake();
  snapshot.transactions = [transaction("1", "Coffee", "PENDING", "-249")];
  await connect(id, workflow);
  const initial = await workflow.prepareSync(id);
  assert.ok(initial.status === "syncing");
  await workflow.runSync(id, initial.claimId);
  const initialFingerprint = (await workflow.status(id)).transactionFingerprint;
  assert.ok(initialFingerprint);
  assert.notEqual(initialFingerprint, initial.transactionFingerprint);
  const before = (await db.query<{ id: string }>(
    "select id from transactions where user_id=$1", [id],
  )).rows[0]!;
  await db.query("update transactions set category='My category' where id=$1", [before.id]);
  assert.equal((await workflow.status(id)).transactionFingerprint, initialFingerprint);

  snapshot.transactions = [transaction("1", "Coffee", "BOOKED", "-299")];
  await due(id);
  const changed = await workflow.prepareSync(id, true);
  assert.ok(changed.status === "syncing");
  assert.equal(changed.transactionFingerprint, initialFingerprint);
  assert.equal((await workflow.runSync(id, changed.claimId, true)).status, "synced");
  const changedFingerprint = (await workflow.status(id)).transactionFingerprint;
  assert.notEqual(changedFingerprint, changed.transactionFingerprint);
  const rows = (await db.query<{ id: string; amount: number; status: string; category: string }>(
    "select id,amount,status,category from transactions where user_id=$1", [id],
  )).rows;
  assert.deepEqual(rows, [{ id: before.id, amount: -299, status: "BOOKED", category: "My category" }]);
  assert.equal((logged.mock.calls.at(-1)!.arguments[1] as { changedTransactions: number }).changedTransactions, 1);

  // Demo Bank may renumber an unchanged row. This must still report no new data.
  snapshot.transactions = [transaction("2", "Coffee", "BOOKED", "-299")];
  await due(id);
  const unchanged = await workflow.prepareSync(id, true);
  assert.ok(unchanged.status === "syncing");
  assert.equal(unchanged.transactionFingerprint, changedFingerprint);
  assert.equal((await workflow.runSync(id, unchanged.claimId, true)).status, "synced");
  assert.equal((await workflow.status(id)).transactionFingerprint, unchanged.transactionFingerprint);
  const summary = logged.mock.calls.at(-1)!.arguments[1] as { insertedTransactions: number; changedTransactions: number };
  assert.equal(summary.insertedTransactions, 0);
  assert.equal(summary.changedTransactions, 0);
  assert.equal((await db.query("select id from transactions where user_id=$1", [id])).rows.length, 1);
});

test("manual background refresh imports newer bank dates without Link and leaves another user unchanged", async () => {
  const id = await user();
  const other = await user();
  const { workflow, snapshot } = fake();
  await connect(id, workflow);
  await workflow.sync(id);
  await connect(other, workflow);
  await workflow.sync(other);
  const original = (await db.query<{ id: string; account_id: string }>(
    "select id,account_id from transactions where user_id=$1", [id],
  )).rows[0]!;
  snapshot.consents = [
    { credentialsId: "unrelated-login", accountIds: ["other-account"], status: "UPDATED" },
    { credentialsId: "cred", accountIds: ["giro"], status: "UPDATED" },
  ];
  // The new row is available only after the fake bank refresh is requested.
  const latest = transaction("2", "New purchase", "BOOKED", "-599");
  latest.dates = { booked: "2026-10-08" };
  snapshot.bankTransactions = [...snapshot.transactions, latest];
  await due(id);
  // Dashboard visits only import the available snapshot.
  assert.equal((await workflow.sync(id)).status, "synced");
  assert.equal((await db.query("select id from transactions where user_id=$1", [id])).rows.length, 1);
  assert.equal(snapshot.refreshes.length, 0);
  await due(id);
  const beforeCalls = snapshot.calls;
  const claim = await workflow.prepareSync(id, true);
  assert.equal(snapshot.calls, beforeCalls, "claim returns before contacting Tink");
  assert.ok(claim.status === "syncing");
  assert.equal((await workflow.runSync(id, claim.claimId, true)).status, "synced");
  const rows = (await db.query<{ id: string; account_id: string; booked_date: string }>(
    "select id,account_id,booked_date from transactions where user_id=$1 order by booked_date desc", [id],
  )).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.booked_date, "2026-10-08");
  assert.equal(rows[0]!.account_id, original.account_id);
  assert.equal(rows[1]!.id, original.id);
  assert.deepEqual(snapshot.refreshes, ["cred"]);
  assert.deepEqual(snapshot.refreshUsers, [id]);
  assert.equal((await db.query("select id from transactions where user_id=$1", [other])).rows.length, 1);
  assert.equal((await db.query("select state from oauth_states where consumed_at is null")).rows.length, 0);
});

test("background refresh rejects sample, shared and expired logins without selecting an unrelated consent", async () => {
  const id = await user();
  const { workflow, snapshot } = fake();
  const initialCalls = snapshot.calls;
  assert.equal((await workflow.sync(id, true)).status, "not_connected");
  assert.equal(snapshot.calls, initialCalls);
  await connect(id, workflow);
  await db.query("update connections set tink_external_user_id='legacy-shared' where user_id=$1", [id]);
  const connectedCalls = snapshot.calls;
  assert.equal((await workflow.sync(id, true)).status, "expired");
  assert.equal(snapshot.calls, connectedCalls);
  await db.query("update connections set tink_external_user_id=$1,status='ACTIVE' where user_id=$2", [id, id]);
  snapshot.consents = [
    { credentialsId: "unrelated-login", accountIds: ["other-account"], status: "UPDATED" },
    { credentialsId: "cred", accountIds: ["giro"], status: "SESSION_EXPIRED" },
  ];
  assert.equal((await workflow.sync(id, true)).status, "expired");
  assert.deepEqual(snapshot.refreshes, []);
});

test("refused background refresh retains saved pending rows and balances without reporting success", async () => {
  const id = await user();
  const { workflow, snapshot } = fake();
  snapshot.transactions = [transaction("1", "Coffee", "PENDING")];
  await connect(id, workflow);
  await workflow.sync(id);
  const before = (await db.query("select id,amount,status from transactions where user_id=$1", [id])).rows;
  const balances = (await db.query("select balance_booked from accounts where user_id=$1", [id])).rows;
  snapshot.refreshFailure = true;
  snapshot.bankTransactions = [];
  snapshot.accounts = [account("giro", "DE001", "90000")];
  await due(id);
  const claim = await workflow.prepareSync(id, true);
  assert.ok(claim.status === "syncing");
  const attemptedLastSynced = claim.lastSynced;
  await assert.rejects(workflow.runSync(id, claim.claimId, true), { code: "BANK_REFRESH_NOT_ALLOWED" });
  assert.deepEqual((await db.query("select id,amount,status from transactions where user_id=$1", [id])).rows, before);
  assert.deepEqual((await db.query("select balance_booked from accounts where user_id=$1", [id])).rows, balances);
  const status = await workflow.status(id);
  assert.equal(status.state, "error");
  assert.equal(status.lastSynced, attemptedLastSynced);
});

test("bank authentication requested during background refresh preserves data and offers reconnect", async () => {
  const id = await user();
  const { workflow, snapshot } = fake();
  await connect(id, workflow);
  await workflow.sync(id);
  snapshot.refreshStatus = "AWAITING_THIRD_PARTY_AUTHENTICATION";
  snapshot.bankTransactions = [];
  await due(id);
  assert.equal((await workflow.sync(id, true)).status, "expired");
  assert.equal((await workflow.status(id)).state, "expired");
  assert.equal((await db.query("select id from transactions where user_id=$1", [id])).rows.length, 1);
  const failedCalls = snapshot.calls;
  assert.equal((await workflow.sync(id, true)).status, "expired");
  assert.equal(snapshot.calls, failedCalls, "a further Refresh does not overwrite Reconnect with a partial-data message");
  const link = await workflow.startConnect(id, "student@example.com", true);
  assert.equal(new URL(link.redirectUrl).pathname, "/1.0/transactions/update-consent");
  assert.equal(new URL(link.redirectUrl).searchParams.get("credentials_id"), "cred");
});

test("a missing Tink user requests reconnect and restores the owned bank login without losing local history", async () => {
  const id = await user();
  const other = await user();
  const { workflow, snapshot } = fake();
  await connect(id, workflow);
  await workflow.sync(id);
  await connect(other, workflow);
  await workflow.sync(other);
  const saved = (await db.query("select id,account_id,amount,status,category from transactions where user_id=$1", [id])).rows;
  const otherStatus = await workflow.status(other);
  snapshot.missingUser = id;
  await due(id);
  assert.equal((await workflow.sync(id, true)).status, "expired");
  assert.equal((await workflow.status(id)).state, "expired");
  assert.equal(snapshot.refreshes.length, 0, "a missing user cannot reach the bank refresh endpoint");
  assert.equal(snapshot.createdUsers.length, 0, "Refresh never silently creates an empty user");
  assert.deepEqual((await db.query("select id,account_id,amount,status,category from transactions where user_id=$1", [id])).rows, saved);
  assert.deepEqual(await workflow.status(other), otherStatus);
  const link = await workflow.startConnect(id, "student@example.com", true);
  assert.equal(new URL(link.redirectUrl).pathname, "/1.0/transactions/connect-accounts");
  assert.deepEqual(snapshot.createdUsers, [id]);
  assert.deepEqual((await db.query("select id,account_id,amount,status,category from transactions where user_id=$1", [id])).rows, saved);
  await workflow.finishConnect(id, new URLSearchParams({ state: link.state, credentials_id: "cred" }), link.state);
  assert.equal((await workflow.sync(id)).status, "synced");
  assert.deepEqual((await db.query("select id,account_id,amount,status,category from transactions where user_id=$1", [id])).rows, saved);
  assert.deepEqual(await workflow.status(other), otherStatus);
});

test("automatic and manual refreshes request reconnect when Tink accounts disappear, preserving saved history", async () => {
  for (const manual of [false, true]) {
    const id = await user();
    const { workflow, snapshot } = fake();
    await connect(id, workflow);
    await workflow.sync(id);
    const saved = (await db.query(
      "select id,account_id,amount,status,category from transactions where user_id=$1", [id],
    )).rows;
    snapshot.accounts = [];
    snapshot.transactions = [];
    snapshot.consents = [];
    await due(id);
    assert.equal((await workflow.sync(id, manual)).status, "expired");
    assert.equal((await workflow.status(id)).state, "expired");
    assert.deepEqual(
      (await db.query(
        "select id,account_id,amount,status,category from transactions where user_id=$1", [id],
      )).rows,
      saved,
    );
    const link = await workflow.startConnect(id, "student@example.com", true);
    assert.equal(new URL(link.redirectUrl).pathname, "/1.0/transactions/connect-accounts");
  }
});

test("automatic and manual refreshes are limited; sample connections never call Tink", async () => {
  const id = await user();
  const { workflow, snapshot } = fake();
  await db.query(
    "insert into connections(user_id,tink_external_user_id) values ($1::uuid,$1::text)",
    [id],
  );
  const initialCalls = snapshot.calls;
  assert.equal((await workflow.sync(id)).status, "not_connected");
  assert.equal(snapshot.calls, initialCalls);
  await connect(id, workflow);
  await workflow.sync(id);
  const calls = snapshot.calls;
  assert.equal((await workflow.sync(id)).status, "current");
  assert.equal((await workflow.sync(id, true)).status, "current");
  assert.equal(snapshot.calls, calls);
});

test("bank status reports connection and sync progress without calling Tink", async () => {
  const id = await user();
  const { workflow, snapshot } = fake();
  const before = snapshot.calls;
  assert.deepEqual(await workflow.status(id), {
    connected: false,
    state: "not_connected",
  });
  assert.equal(snapshot.calls, before);

  await connect(id, workflow);
  const syncing = await workflow.status(id);
  assert.equal(syncing.state, "syncing");
  assert.equal(syncing.transactionFingerprint, undefined);
  await workflow.sync(id);
  const synced = await workflow.status(id);
  assert.equal(synced.connected, true);
  assert.equal(synced.state, "synced");
  assert.ok(synced.lastSynced);
  assert.ok(synced.transactionFingerprint);

  await db.query(
    "update connections set status='ERROR',sync_complete=false where user_id=$1",
    [id],
  );
  const failed = await workflow.status(id);
  assert.equal(failed.state, "error");
  assert.equal(failed.transactionFingerprint, undefined);
});

test("a failed paginated fetch preserves pending rows and balances, and throttles retries", async () => {
  const id = await user();
  const { workflow, snapshot } = fake();
  snapshot.transactions = [transaction("1", "Edeka", "PENDING")];
  await connect(id, workflow);
  await workflow.sync(id);
  await due(id);
  snapshot.accounts = [account("giro", "DE001", "99999")];
  snapshot.failTransactions = true;
  await assert.rejects(workflow.sync(id));
  assert.equal(
    (
      await db.query<{ balance_booked: number }>(
        "select balance_booked from accounts where user_id=$1",
        [id],
      )
    ).rows[0]!.balance_booked,
    10000,
  );
  assert.equal(
    (await db.query("select id from transactions where user_id=$1", [id])).rows
      .length,
    1,
  );
  const calls = snapshot.calls;
  assert.equal((await workflow.sync(id)).status, "retry_later");
  assert.equal(snapshot.calls, calls);
});

test("a stalled sync releases the database and another user can import the same Demo Bank accounts", { timeout: 5000 }, async () => {
  const first = await user();
  const second = await user();
  const { workflow, tink } = fake();
  await connect(first, workflow);
  await connect(second, workflow);
  let heldConnections = 0;
  const countedPool = {
    query: pool.query.bind(pool),
    connect: async () => {
      heldConnections++;
      const client = await pool.connect();
      return { query: client.query.bind(client), release() {
        heldConnections--;
        client.release();
      } };
    },
  } as unknown as Pool;
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const waiting = new Promise<void>((resolve) => { started = resolve; });
  const identities: string[] = [];
  const isolated = createBankWorkflow(countedPool, {
    ...tink,
    userAccessToken: async (externalId) => {
      identities.push(externalId);
      assert.equal(heldConnections, 0, "Tink never occupies a database connection");
      return externalId;
    },
    fetchAccounts: async (token) => {
      if (token === first) { started(); await gate; }
      return [account()];
    },
    fetchAllTransactions: async () => [transaction()],
    fetchProviderConsents: async () => [{ credentialsId: "same-demo-login", accountIds: ["giro"], status: "UPDATED" }],
  });
  const pending = isolated.sync(first);
  try {
    await waiting;
    assert.equal(heldConnections, 0);
    assert.equal((await isolated.status(first)).state, "syncing");
    assert.equal((await isolated.sync(first, true)).status, "busy");
    assert.equal((await isolated.sync(second)).status, "synced");
    assert.equal((await isolated.status(second)).state, "synced");
  } finally { release(); }
  assert.equal((await pending).status, "synced");
  assert.deepEqual(identities, [first, second]);
  const rows = (await db.query<{ user_id: string; iban: string }>(
    "select user_id,iban from accounts where user_id=any($1::uuid[]) order by user_id", [[first, second]],
  )).rows;
  assert.deepEqual(rows, [{ user_id: first, iban: "DE001" }, { user_id: second, iban: "DE001" }]);
});

test("an abandoned sync expires and a late worker cannot overwrite its replacement", async () => {
  const id = await user();
  const { workflow, tink } = fake();
  await connect(id, workflow);
  await workflow.sync(id);
  await due(id);
  let clock = Date.now();
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const waiting = new Promise<void>((resolve) => { started = resolve; });
  const slow = createBankWorkflow(pool, {
    ...tink,
    fetchAccounts: async () => { started(); await gate; return [account("giro", "DE001", "99999")]; },
  }, () => clock);
  const first = await slow.prepareSync(id, true);
  assert.equal(first.status, "syncing");
  if (first.status !== "syncing") throw new Error("expected sync claim");
  const pending = slow.runSync(id, first.claimId);
  await waiting;
  assert.equal((await slow.status(id)).state, "syncing", "old saved data does not hide a new attempt");
  clock += 91_000;
  assert.equal((await slow.status(id)).state, "error");
  const replacement = createBankWorkflow(pool, tink, () => clock);
  try { assert.equal((await replacement.sync(id, true)).status, "synced"); }
  finally { release(); }
  assert.equal((await pending).status, "busy");
  assert.equal((await replacement.status(id)).state, "synced");
  const row = (await db.query<{ balance_booked: number }>(
    "select balance_booked from accounts where user_id=$1", [id],
  )).rows[0]!;
  assert.equal(row.balance_booked, 10000, "late data was fenced out");
});

test("an expired API token is retried once without treating healthy bank consent as expired", async () => {
  const id = await user();
  const { workflow, tink } = fake();
  await connect(id, workflow);
  let tokens = 0;
  const retrying = createBankWorkflow(pool, {
    ...tink,
    userAccessToken: async () => `token-${++tokens}`,
    fetchAllTransactions: async (token) => {
      if (token === "token-1") throw new TinkError("Expired API token", 401, "HTTP_401");
      return [transaction()];
    },
  });
  assert.equal((await retrying.sync(id)).status, "synced");
  assert.equal(tokens, 2);
  assert.equal((await retrying.status(id)).state, "synced");
  await due(id);
  const unauthorized = createBankWorkflow(pool, {
    ...tink,
    fetchAllTransactions: async () => { throw new TinkError("Unauthorized", 401, "HTTP_401"); },
  });
  await assert.rejects(unauthorized.sync(id), { status: 401 });
  assert.equal((await unauthorized.status(id)).state, "error");
  assert.equal((await db.query("select id from transactions where user_id=$1", [id])).rows.length, 1);
});

test("duplicate credentials retain the verified user's history and active sync claim", async () => {
  const id = await user();
  const { workflow } = fake();
  await connect(id, workflow);
  await workflow.sync(id);
  const old = (await db.query("select id from accounts where user_id=$1", [id])).rows[0];
  await due(id);
  const claim = await workflow.prepareSync(id, true);
  assert.equal(claim.status, "syncing");
  if (claim.status !== "syncing") throw new Error("expected sync claim");
  const link = await workflow.startConnect(id, "student@example.com");
  assert.equal(await workflow.finishConnect(id, new URLSearchParams({
    state: link.state, error: "INVALID_STATE", error_reason: "INVALID_STATE_DUPLICATE_CREDENTIALS",
  }), link.state), "already_connected");
  assert.deepEqual((await db.query("select id from accounts where user_id=$1", [id])).rows[0], old);
  assert.equal((await db.query("select id from transactions where user_id=$1", [id])).rows.length, 1);
  assert.equal((await workflow.status(id)).state, "syncing");
  assert.equal((await db.query<{ sync_claim_id: string }>(
    "select sync_claim_id from connections where user_id=$1", [id],
  )).rows[0]!.sync_claim_id, claim.claimId);
  assert.equal((await workflow.runSync(id, claim.claimId)).status, "synced");
});

test("a legacy shared Tink identity cannot sync and reconnect binds to the current app user", async () => {
  const id = await user();
  const { workflow, snapshot } = fake();
  await connect(id, workflow);
  await db.query("update connections set tink_external_user_id='shared-bank-user' where user_id=$1", [id]);
  const before = snapshot.calls;
  assert.equal((await workflow.sync(id, true)).status, "expired");
  assert.equal(snapshot.calls, before, "never requests a shared identity's data");
  const link = await workflow.startConnect(id, "student@example.com", true);
  const state = (await db.query<{ tink_external_user_id: string }>(
    "select tink_external_user_id from oauth_states where state=$1", [link.state],
  )).rows[0]!;
  assert.equal(state.tink_external_user_id, id);
  assert.equal(new URL(link.redirectUrl).searchParams.get("input_provider"), "de-demobank-password");
  await workflow.finishConnect(id, new URLSearchParams({ state: link.state, credentials_id: "cred" }), link.state);
  assert.equal((await workflow.sync(id)).status, "synced");
});

test("incomplete transactions do not block usable rows or delete saved pending rows", async () => {
  const id = await user();
  const { workflow, snapshot } = fake();
  snapshot.transactions = [transaction("1"), transaction("2", "Coffee", "PENDING")];
  await connect(id, workflow);
  await workflow.sync(id);
  const pendingBefore = (await db.query<{ id: string }>(
    "select id from transactions where user_id=$1 and status='PENDING'", [id],
  )).rows[0]!.id;
  await due(id);
  snapshot.accounts = [account("giro", "DE001", "99999")];
  snapshot.transactions = [
    transaction("101"),
    transaction("3", "New purchase"),
    { ...transaction("2", "Coffee", "PENDING"), dates: {} },
    { ...transaction("4"), id: "", identifiers: {} },
    { ...transaction("5"), amount: undefined },
  ];
  const result = await workflow.sync(id);
  assert.equal(result.status, "partial");
  assert.equal(result.skippedTransactions, 3);
  assert.ok(result.lastSynced);
  assert.equal(
    (
      await db.query<{ balance_booked: number }>(
        "select balance_booked from accounts where user_id=$1",
        [id],
      )
    ).rows[0]!.balance_booked,
    99999,
  );
  assert.equal(
    (await db.query("select id from transactions where user_id=$1", [id])).rows
      .length,
    3,
  );
  assert.equal((await db.query<{ id: string }>(
    "select id from transactions where user_id=$1 and status='PENDING'", [id],
  )).rows[0]!.id, pendingBefore);
  assert.equal((await db.query<{ sync_complete: boolean }>(
    "select sync_complete from connections where user_id=$1", [id],
  )).rows[0]!.sync_complete, false);
  const calls = snapshot.calls;
  assert.equal((await workflow.sync(id, true)).status, "partial");
  assert.equal(snapshot.calls, calls, "partial snapshots still respect the retry interval");

  await due(id);
  snapshot.transactions = [transaction("101"), transaction("3", "New purchase")];
  assert.equal((await workflow.sync(id)).status, "synced");
  assert.equal((await db.query(
    "select id from transactions where user_id=$1 and status='PENDING'", [id],
  )).rows.length, 0, "only a complete usable snapshot may remove vanished pending rows");
  assert.equal((await db.query<{ sync_complete: boolean }>(
    "select sync_complete from connections where user_id=$1", [id],
  )).rows[0]!.sync_complete, true);
});

test("transactions for an account absent from the account snapshot are skipped without deleting pending history", async () => {
  const id = await user();
  const { workflow, snapshot } = fake();
  snapshot.transactions = [transaction("1", "Coffee", "PENDING")];
  await connect(id, workflow);
  await workflow.sync(id);
  await due(id);
  snapshot.transactions = [
    transaction("2", "New purchase"),
    { ...transaction("3"), accountId: "account-not-in-snapshot" },
  ];
  const result = await workflow.sync(id);
  assert.equal(result.status, "partial");
  assert.equal(result.skippedTransactions, 1);
  const rows = (await db.query<{ status: string }>(
    "select status from transactions where user_id=$1", [id],
  )).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((row) => row.status === "PENDING").length, 1);
});

test("a wholly unusable transaction snapshot preserves existing transactions and remains incomplete", async () => {
  const id = await user();
  const { workflow, snapshot } = fake();
  snapshot.transactions = [transaction("1", "Coffee", "PENDING")];
  await connect(id, workflow);
  await workflow.sync(id);
  const before = (await db.query("select * from transactions where user_id=$1", [id])).rows;
  await due(id);
  snapshot.transactions = [{ ...transaction("1", "Coffee", "PENDING"), amount: undefined }];
  assert.equal((await workflow.sync(id)).status, "partial");
  assert.deepEqual((await db.query("select * from transactions where user_id=$1", [id])).rows, before);
});

test("unsafe amounts still fail atomically instead of being silently skipped", async () => {
  const id = await user();
  const { workflow, snapshot } = fake();
  await connect(id, workflow);
  await workflow.sync(id);
  await due(id);
  snapshot.accounts = [account("giro", "DE001", "99999")];
  snapshot.transactions[0]!.amount!.value!.unscaledValue = "9007199254740992";
  await assert.rejects(workflow.sync(id), /safe integer range/);
  assert.equal((await db.query<{ balance_booked: number }>(
    "select balance_booked from accounts where user_id=$1", [id],
  )).rows[0]!.balance_booked, 10000);
});

test("complete fetch removes vanished pending rows, retains booked history and flags expired consent", async () => {
  const id = await user();
  const { workflow, snapshot } = fake();
  snapshot.transactions = [
    transaction("1"),
    transaction("2", "Coffee", "PENDING"),
  ];
  await connect(id, workflow);
  await workflow.sync(id);
  await due(id);
  snapshot.transactions = [];
  snapshot.consents[0]!.status = "SESSION_EXPIRED";
  assert.equal((await workflow.sync(id)).status, "expired");
  const rows = (
    await db.query<{ status: string }>(
      "select status from transactions where user_id=$1",
      [id],
    )
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.status, "BOOKED");
  const renewal = await workflow.startConnect(id, "student@example.com", true);
  assert.equal(
    new URL(renewal.redirectUrl).pathname,
    "/1.0/transactions/update-consent",
  );
  assert.equal(
    new URL(renewal.redirectUrl).searchParams.get("credentials_id"),
    "cred",
  );
});

test("same IBAN is matched within each user and reconnect preserves the local account", async () => {
  const id = await user();
  const other = await user();
  const { workflow, snapshot } = fake();
  await connect(id, workflow);
  await connect(other, workflow);
  const before = (
    await db.query<{ id: string }>("select id from accounts where user_id=$1", [
      id,
    ])
  ).rows[0]!.id;
  snapshot.accounts[0]!.id = "relinked-giro";
  await connect(id, workflow);
  const after = (
    await db.query<{ id: string; provider_account_id: string }>(
      "select id,provider_account_id from accounts where user_id=$1",
      [id],
    )
  ).rows;
  assert.equal(after.length, 1);
  assert.equal(after[0]!.id, before);
  assert.equal(after[0]!.provider_account_id, "relinked-giro");
  assert.equal(
    (
      await db.query<{ provider_account_id: string }>(
        "select provider_account_id from accounts where user_id=$1",
        [other],
      )
    ).rows[0]!.provider_account_id,
    "giro",
  );
});

test("migration 009 keeps older cents-only inserts compatible with amount_exact", async () => {
  const id = await user();
  const { workflow } = fake();
  await connect(id, workflow);
  const accountId = (
    await db.query<{ id: string }>("select id from accounts where user_id=$1", [
      id,
    ])
  ).rows[0]!.id;
  const result = await db.query<{ amount_exact: string }>(
    `insert into transactions
    (account_id,provider_transaction_id,amount,description,booked_date,status)
    values ($1,'legacy',-3400,'E.on','2026-10-01','BOOKED') returning amount_exact::text`,
    [accountId],
  );
  assert.equal(Number(result.rows[0]!.amount_exact), -34);
});

// Tink protocol checks.
const config: TinkConfig = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  redirectUri: "http://localhost:3000/api/tink",
  market: "DE",
  locale: "en_US",
  testMode: true,
  timeoutMs: 50,
};
let client: TinkClient;

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;
let handler: Handler = () => {
  throw new Error("no fake Tink handler set");
};
const calls: { path: string; form: URLSearchParams | null }[] = [];

const fakeFetch = (async (
  input: string | URL | Request,
  init: RequestInit = {},
) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== "https://api.tink.com")
    throw new Error(`unexpected call to ${url.origin}`);
  calls.push({
    path: url.pathname,
    form: init.body instanceof URLSearchParams ? init.body : null,
  });
  return handler(url, init);
}) as typeof fetch;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  calls.length = 0;
  client = createTinkClient(config, { fetch: fakeFetch });
});

function tinkAuth(url: URL): Response | undefined {
  if (url.pathname === "/api/v1/oauth/token") {
    return json(200, {
      access_token: "token",
      token_type: "bearer",
      expires_in: 1800,
    });
  }
  return undefined;
}

test("Tink Link gets a delegated code for Tink Link's actor, and the URL carries code and state", async () => {
  calls.length = 0;
  handler = (url) => tinkAuth(url) ?? json(200, { code: "link-code" });

  const code = await client.tinkLinkCode("user-1", "demo@example.com");
  assert.equal(code, "link-code");
  const grant = calls.find(
    (c) => c.path === "/api/v1/oauth/authorization-grant/delegate",
  );
  assert.ok(
    grant,
    "uses the delegate endpoint, not the plain authorization grant",
  );
  assert.equal(
    grant.form?.get("actor_client_id"),
    "df05e4b379934cd09963197cc855bfe9",
  );
  assert.equal(grant.form?.get("external_user_id"), "user-1");
  assert.match(grant.form?.get("scope") ?? "", /credentials:write/);

  const link = new URL(client.tinkLinkUrl(code, "state-1"));
  assert.equal(
    link.origin + link.pathname,
    "https://link.tink.com/1.0/transactions/connect-accounts",
  );
  assert.equal(link.searchParams.get("authorization_code"), "link-code");
  assert.equal(link.searchParams.get("state"), "state-1");
  assert.equal(link.searchParams.get("client_id"), "test-client-id");
  assert.equal(link.searchParams.get("test"), "true");
  assert.equal(link.searchParams.get("input_provider"), "de-demobank-password");
  assert.equal(link.searchParams.has("input_username"), false);
  assert.equal(link.searchParams.has("input_password"), false);
  assert.equal(
    link.searchParams.get("redirect_uri"),
    "http://localhost:3000/api/tink",
  );
});

test("a missing Tink user is created and the grant retried; 'already exists' is fine", async () => {
  calls.length = 0;
  let delegateCalls = 0;
  handler = (url) => {
    const auth = tinkAuth(url);
    if (auth) return auth;
    if (url.pathname === "/api/v1/user/create")
      return json(409, { errorCode: "USER_EXISTS" });
    delegateCalls++;
    return delegateCalls === 1
      ? json(404, { errorMessage: "User not found" })
      : json(200, { code: "second-try" });
  };

  assert.equal(await client.tinkLinkCode("user-2", "hint"), "second-try");
  const order = calls
    .map((c) => c.path)
    .filter((p) => p !== "/api/v1/oauth/token");
  assert.deepEqual(order, [
    "/api/v1/oauth/authorization-grant/delegate",
    "/api/v1/user/create",
    "/api/v1/oauth/authorization-grant/delegate",
  ]);
});

test("the backend's own data token includes provider-consents:read", async () => {
  calls.length = 0;
  handler = (url) => tinkAuth(url) ?? json(200, { code: "data-code" });

  assert.equal(await client.userAccessToken("user-1"), "token");
  const grant = calls.find(
    (c) => c.path === "/api/v1/oauth/authorization-grant",
  );
  assert.equal(grant?.form?.get("external_user_id"), "user-1");
  assert.match(grant?.form?.get("scope") ?? "", /provider-consents:read/);
  const exchange = calls.filter((c) => c.path === "/api/v1/oauth/token").at(-1);
  assert.equal(exchange?.form?.get("code"), "data-code");
});

test("silent refresh requests only refresh scopes and waits past cached UPDATED until the timestamp advances", async () => {
  let reads = 0;
  let refreshes = 0;
  handler = (url, init) => {
    const auth = tinkAuth(url);
    if (auth) return auth;
    if (url.pathname === "/api/v1/oauth/authorization-grant") return json(200, { code: "refresh-code" });
    if (url.pathname === "/api/v1/provider-consents") return json(200, { providerConsents: [
      { credentialsId: "unrelated", accountIds: ["other"], status: "UPDATED" },
      { credentialsId: "expired", accountIds: ["giro"], status: "SESSION_EXPIRED" },
      { credentialsId: "cred", accountIds: ["giro"], status: "UPDATED" },
      { credentialsId: "cred", accountIds: ["giro"], status: "UPDATED" },
    ] });
    if (url.pathname === "/api/v1/credentials/cred/refresh") {
      assert.equal(init.method, "POST");
      assert.equal(url.searchParams.get("authenticate"), "false");
      assert.deepEqual(JSON.parse(String(init.body)), { productNames: ["PRODUCT_ACCOUNT_AGGREGATION"] },
        "same product context as Tink Link, without bank credentials");
      assert.equal(new Headers(init.headers).get("content-type"), "application/json");
      refreshes++;
      return new Response(null, { status: 204 });
    }
    assert.equal(url.pathname, "/api/v1/credentials/cred");
    reads++;
    return json(200, { id: "cred", status: reads === 3 ? "UPDATING" : "UPDATED", updated: reads >= 3 ? 2 : 1 });
  };
  await client.refreshBank("user-1", ["giro"]);
  assert.equal(reads, 4, "cached UPDATED and a changed timestamp while UPDATING are not completion");
  assert.equal(refreshes, 1);
  const grant = calls.find((call) => call.path === "/api/v1/oauth/authorization-grant");
  assert.equal(grant?.form?.get("external_user_id"), "user-1");
  assert.equal(grant?.form?.get("scope"), "provider-consents:read,credentials:read,credentials:refresh");
  assert.ok(calls.every((call) => !call.path.includes("delegate")));
});

test("a rejected silent refresh identifies its HTTP status and operation without logging upstream secrets", async () => {
  handler = (url) => {
    const auth = tinkAuth(url);
    if (auth) return auth;
    if (url.pathname === "/api/v1/oauth/authorization-grant") return json(200, { code: "refresh-code" });
    if (url.pathname === "/api/v1/provider-consents") return json(200, { providerConsents: [
      { credentialsId: "cred", accountIds: ["giro"], status: "UPDATED" },
    ] });
    if (url.pathname.endsWith("/refresh")) return json(429, {
      errorCode: "fake-upstream-secret", message: "fake-password and account information",
    });
    return json(200, { id: "cred", status: "UPDATED", updated: 1 });
  };
  await assert.rejects(client.refreshBank("user-1", ["giro"]), (error) => {
    assert.deepEqual(bankErrorDetails(error), {
      code: "TINK_ERROR", status: 429, operation: "credentials-refresh",
    });
    return true;
  });
});

test("a previous TEMPORARY_ERROR and its cached status do not prevent a new background refresh", async () => {
  let reads = 0;
  let refreshes = 0;
  handler = (url) => {
    const auth = tinkAuth(url);
    if (auth) return auth;
    if (url.pathname === "/api/v1/oauth/authorization-grant") return json(200, { code: "refresh-code" });
    if (url.pathname === "/api/v1/provider-consents") return json(200, { providerConsents: [
      { credentialsId: "cred", accountIds: ["giro"], status: "TEMPORARY_ERROR" },
    ] });
    if (url.pathname.endsWith("/refresh")) {
      refreshes++;
      return new Response(null, { status: 204 });
    }
    assert.equal(url.pathname, "/api/v1/credentials/cred");
    reads++;
    return json(200, {
      id: "cred", status: reads < 3 ? "TEMPORARY_ERROR" : reads === 3 ? "UPDATING" : "UPDATED",
      updated: reads === 4 ? 2 : 1, statusUpdated: reads < 3 ? 100 : 200 + reads,
    });
  };
  await client.refreshBank("user-1", ["giro"]);
  assert.equal(refreshes, 1);
  assert.equal(reads, 4);
});

test("a new temporary bank failure is recognised even if the previous refresh had the same error", async () => {
  let reads = 0;
  handler = (url) => {
    const auth = tinkAuth(url);
    if (auth) return auth;
    if (url.pathname === "/api/v1/oauth/authorization-grant") return json(200, { code: "refresh-code" });
    if (url.pathname === "/api/v1/provider-consents") return json(200, { providerConsents: [
      { credentialsId: "cred", accountIds: ["giro"], status: "TEMPORARY_ERROR" },
    ] });
    if (url.pathname.endsWith("/refresh")) return new Response(null, { status: 204 });
    reads++;
    return json(200, { id: "cred", status: "TEMPORARY_ERROR", updated: 1, statusUpdated: reads });
  };
  await assert.rejects(client.refreshBank("user-1", ["giro"]), { code: "BANK_REFRESH_FAILED" });
  assert.equal(reads, 2);
});

test("an unfinished background bank refresh respects the overall deadline instead of importing cached data", async () => {
  let refreshes = 0;
  handler = (url) => {
    const auth = tinkAuth(url);
    if (auth) return auth;
    if (url.pathname === "/api/v1/oauth/authorization-grant") return json(200, { code: "refresh-code" });
    if (url.pathname === "/api/v1/provider-consents") return json(200, { providerConsents: [
      { credentialsId: "cred", accountIds: ["giro"], status: "UPDATED" },
    ] });
    if (url.pathname.endsWith("/refresh")) {
      refreshes++;
      return new Response(null, { status: 204 });
    }
    assert.equal(url.pathname, "/api/v1/credentials/cred");
    return json(200, { id: "cred", status: "UPDATED", updated: 1 });
  };
  const bounded = createTinkClient(config, { fetch: fakeFetch, signal: AbortSignal.timeout(50) });
  await assert.rejects(bounded.refreshBank("user-1", ["giro"]), { code: "TINK_TIMEOUT" });
  assert.equal(refreshes, 1);
});

test("transactions follow nextPageToken to the end", async () => {
  handler = (url) => {
    const page = url.searchParams.get("pageToken") ?? "1";
    const next = page === "1" ? "2" : page === "2" ? "3" : "";
    return json(200, {
      transactions: [{ id: `t${page}` }],
      nextPageToken: next,
    });
  };
  const all = await client.fetchAllTransactions("user-token");
  assert.deepEqual(
    all.map((t) => t.id),
    ["t1", "t2", "t3"],
  );
});

test("a repeated page token stops the walk instead of looping forever", async () => {
  handler = () =>
    json(200, { transactions: [{ id: "same" }], nextPageToken: "again" });
  await assert.rejects(client.fetchAllTransactions("user-token"), {
    code: "PAGE_TOKEN_REPEATED",
  });
});

test("a Tink request that hangs fails after the timeout", async () => {
  handler = (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      const keepAlive = setTimeout(
        () => reject(new Error("timeout was not enforced")),
        2000,
      );
      init.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(keepAlive);
          reject(init.signal?.reason);
        },
        { once: true },
      );
    });
  const started = Date.now();
  await assert.rejects(client.fetchAccounts("user-token"), {
    code: "TINK_TIMEOUT",
    status: 504,
  });
  assert.ok(Date.now() - started < 2000, "gave up promptly");
});

test("an unreachable Tink becomes a TinkError, not a crash", async () => {
  handler = () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(client.fetchAccounts("user-token"), {
    code: "TINK_UNREACHABLE",
    status: 503,
  });
});

test("the overall sync deadline cancels Tink calls even with a longer per-request timeout", async () => {
  const controller = new AbortController();
  handler = (_url, init) => new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  });
  const bounded = createTinkClient({ ...config, timeoutMs: 10_000 }, {
    fetch: fakeFetch, signal: controller.signal,
  });
  const pending = bounded.fetchAccounts("user-token");
  controller.abort(new DOMException("Budget exceeded", "TimeoutError"));
  await assert.rejects(pending, { code: "TINK_TIMEOUT", status: 504 });
});

test("renewing a consent uses Tink's update-consent link for that bank login", () => {
  const link = new URL(
    client.updateConsentUrl("link-code", "cred-42", "state-2"),
  );
  assert.equal(
    link.origin + link.pathname,
    "https://link.tink.com/1.0/transactions/update-consent",
  );
  assert.equal(link.searchParams.get("credentials_id"), "cred-42");
  assert.equal(link.searchParams.get("authorization_code"), "link-code");
  assert.equal(link.searchParams.get("state"), "state-2");
});

test("failed-login clean-up deletes only failed logins that never got accounts", async () => {
  calls.length = 0;
  const deleted: string[] = [];
  handler = (url, init) => {
    const auth = tinkAuth(url);
    if (auth) return auth;
    if (url.pathname === "/api/v1/oauth/authorization-grant")
      return json(200, { code: "cleanup-code" });
    if (url.pathname === "/api/v1/provider-consents") {
      return json(200, {
        providerConsents: [
          { credentialsId: "user1", status: "UPDATED", accountIds: ["giro"] },
          {
            credentialsId: "user2",
            status: "AUTHENTICATION_ERROR",
            accountIds: [],
          },
        ],
      });
    }
    if (init.method === "DELETE") {
      deleted.push(url.pathname);
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected ${url.pathname}`);
  };

  assert.equal(await client.removeFailedLogins("user-1"), 1);
  assert.deepEqual(deleted, ["/api/v1/credentials/user2"]);
  const grant = calls.find(
    (c) => c.path === "/api/v1/oauth/authorization-grant",
  );
  assert.equal(
    grant?.form?.get("scope"),
    "provider-consents:read,credentials:write",
  );
});

// Bank consent checks.
test("a healthy overlapping consent covers an account despite an expired old login", () => {
  const consents = [
    { credentialsId: "old", accountIds: ["giro"], status: "SESSION_EXPIRED" },
    {
      credentialsId: "new",
      accountIds: ["giro"],
      status: "UPDATED",
      sessionExpiryDate: "2000",
    },
    { credentialsId: "failed", accountIds: [], status: "AUTHENTICATION_ERROR" },
  ];
  assert.deepEqual(
    accountsNeedingRelink(consents, ["giro", "unknown"], 1000),
    [],
  );
  assert.equal(credentialsToRenew(consents, ["giro"], 1000), null);
});

test("expiry is checked before Tink changes the status; temporary errors do not request a relink", () => {
  const consents = [
    {
      credentialsId: "renew-me",
      accountIds: ["giro"],
      status: "UPDATED",
      sessionExpiryDate: 999,
    },
    {
      credentialsId: "retry",
      accountIds: ["savings"],
      status: "TEMPORARY_ERROR",
    },
  ];
  assert.deepEqual(accountsNeedingRelink(consents, ["giro", "savings"], 1000), [
    "giro",
  ]);
  assert.equal(
    credentialsToRenew(consents, ["giro", "savings"], 1000),
    "renew-me",
  );
});

test("cleanup never removes credentials that have accounts or an unfinished login", () => {
  assert.deepEqual(
    failedLoginsToRemove([
      {
        credentialsId: "has-money",
        accountIds: ["giro"],
        status: "PERMANENT_ERROR",
      },
      { credentialsId: "unfinished", status: "AUTHENTICATING" },
      {
        credentialsId: "failed",
        accountIds: [],
        status: "AUTHENTICATION_ERROR",
      },
    ]),
    ["failed"],
  );
});

test("missing bank references import for both users and preserve rows across refreshes", async () => {
  const id = await user();
  const other = await user();
  const { workflow, snapshot } = fake();
  // Identical genuine purchases have different Tink ids and must all survive.
  snapshot.transactions = Array.from({ length: 4 }, (_, index) => ({
    ...transaction(String(index + 1), "Coffee"),
    identifiers: {},
  }));

  await connect(id, workflow);
  assert.equal((await workflow.sync(id)).status, "synced");
  await connect(other, workflow);
  assert.equal((await workflow.sync(other)).status, "synced");

  type SavedRow = {
    id: string;
    provider_transaction_id: string;
    category: string | null;
    occurrence: number;
  };
  const saved = async (userId: string) => (await db.query<SavedRow>(
    "select id,provider_transaction_id,category,occurrence from transactions where user_id=$1 order by occurrence",
    [userId],
  )).rows;
  const before = await saved(id);
  const otherBefore = await saved(other);
  assert.equal(before.length, 4);
  assert.equal(otherBefore.length, 4);
  assert.deepEqual(
    before.map((row) => row.provider_transaction_id),
    ["tink:tx-1", "tink:tx-2", "tink:tx-3", "tink:tx-4"],
  );
  assert.equal(new Set([...before, ...otherBefore].map((row) => row.id)).size, 8);
  await db.query("update transactions set category='My category' where id=$1", [before[0]!.id]);

  // The same snapshot must not insert duplicates.
  await due(id);
  assert.equal((await workflow.sync(id)).status, "synced");
  assert.equal((await saved(id)).length, 4);

  // Reconnecting may change Tink ids; content matching keeps local identities.
  snapshot.transactions = snapshot.transactions.map((row, index) => ({
    ...row,
    id: `reconnected-${index + 1}`,
  }));
  await due(id);
  assert.equal((await workflow.sync(id)).status, "synced");
  const reconnected = await saved(id);
  assert.deepEqual(reconnected.map((row) => row.id), before.map((row) => row.id));
  assert.equal(reconnected[0]!.category, "My category");

  // If the bank later provides references, update metadata in the same rows.
  snapshot.transactions = snapshot.transactions.map((row, index) => ({
    ...row,
    identifiers: { providerTransactionId: `bank-${index + 1}` },
  }));
  await due(id);
  assert.equal((await workflow.sync(id)).status, "synced");
  const after = await saved(id);
  assert.deepEqual(after.map((row) => row.id), before.map((row) => row.id));
  assert.deepEqual(after.map((row) => row.provider_transaction_id), ["bank-1", "bank-2", "bank-3", "bank-4"]);
  assert.equal(after[0]!.category, "My category");
  assert.deepEqual(await saved(other), otherBefore);
});
