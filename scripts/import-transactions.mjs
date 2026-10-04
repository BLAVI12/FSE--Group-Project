import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  IMPORTER_VERSION,
  prepareTransactions,
  stableUuid,
  transactionIdentity,
  upsertIdempotently
} from "../src/features/transactions/import-core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mappingPath = path.join(root, "supabase/seed-data/transaction-categories.json");
const CHUNK_SIZE = 150;

function normalize(value) {
  return value.normalize("NFKC").toLocaleLowerCase("de-DE");
}

function transactionRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.transactions)) return payload.transactions;
  if (Array.isArray(payload?.data?.transactions)) return payload.data.transactions;
  throw new Error("Input must be a JSON array or contain a transactions array.");
}

function chunks(values, size = CHUNK_SIZE) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function getArgs(argv) {
  const options = { apply: false, source: "transaction-json", inputPath: null };
  for (const argument of argv) {
    if (argument === "--apply") {
      options.apply = true;
    } else if (argument.startsWith("--source=")) {
      options.source = argument.slice("--source=".length);
    } else if (argument.startsWith("--")) {
      throw new Error("Unknown importer option.");
    } else if (options.inputPath === null) {
      options.inputPath = argument;
    } else {
      throw new Error("Only one input path may be supplied.");
    }
  }
  if (!options.inputPath) {
    throw new Error("Usage: npm run import:transactions -- <json-path> [--source=name] [--apply]");
  }
  return options;
}

function baseSummary(prepared, received) {
  const rows = prepared.transactions;
  const byCode = new Map();
  for (const failure of prepared.failures) {
    byCode.set(failure.code, (byCode.get(failure.code) ?? 0) + 1);
  }
  return {
    received,
    valid: rows.length,
    accounts: new Set(rows.map((row) => row.source_account_id)).size,
    excluded: rows.filter((row) => row.is_excluded).length,
    accepted: rows.filter((row) => !row.is_excluded).length,
    unmatched: rows.filter((row) => row.is_unmatched).length,
    ambiguous: rows.filter((row) => row.is_ambiguous).length,
    failed: prepared.failures.length,
    failures_by_code: Object.fromEntries(byCode)
  };
}

function requireApplyConfiguration() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.SUPABASE_USER_ID;
  if (!url || !serviceRoleKey || !userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error("--apply requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_USER_ID.");
  }
  return { url, serviceRoleKey, userId };
}

async function throwOnError(query) {
  const result = await query;
  if (result.error) {
    throw new Error("Database operation failed.");
  }
  return result.data;
}

async function fetchByIds(client, table, columns, userId, idColumn, ids, extraFilters = {}) {
  const found = [];
  for (const group of chunks([...new Set(ids)])) {
    let query = client.from(table).select(columns).eq("user_id", userId);
    for (const [column, value] of Object.entries(extraFilters)) query = query.eq(column, value);
    const result = await throwOnError(query.in(idColumn, group));
    found.push(...result);
  }
  return found;
}

async function ensureAccounts(client, userId, rows, source) {
  const currenciesByAccount = new Map();
  for (const row of rows) {
    const currencies = currenciesByAccount.get(row.source_account_id) ?? new Set();
    currencies.add(row.currency);
    currenciesByAccount.set(row.source_account_id, currencies);
  }
  if ([...currenciesByAccount.values()].some((currencies) => currencies.size !== 1)) {
    throw new Error("An account contains more than one currency; account resolution is ambiguous.");
  }

  const accountIds = [...currenciesByAccount.keys()];
  const current = await fetchByIds(
    client, "accounts", "id,source_account_id", userId, "source_account_id", accountIds, { source }
  );
  const known = new Set(current.map((account) => account.source_account_id));
  const missing = accountIds.filter((id) => !known.has(id));
  for (const group of chunks(missing)) {
    const inserts = group.map((sourceAccountId) => ({
      user_id: userId,
      source,
      source_account_id: sourceAccountId,
      connection_id: null,
      provider_account_id: null,
      name: null,
      type: null,
      currency: [...currenciesByAccount.get(sourceAccountId)][0],
      metadata: { source }
    }));
    await throwOnError(
      client.from("accounts").upsert(inserts, { onConflict: "user_id,source,source_account_id" })
    );
  }

  const all = await fetchByIds(
    client, "accounts", "id,source_account_id", userId, "source_account_id", accountIds, { source }
  );
  const accountMap = new Map(all.map((account) => [account.source_account_id, account.id]));
  if (accountMap.size !== accountIds.length) {
    throw new Error("One or more source accounts could not be resolved.");
  }
  return accountMap;
}

async function loadSystemCatalog(client, userId) {
  const [categories, userCategories, categoryRules, userCategoryRules, systemExclusions, userExclusions] = await Promise.all([
    throwOnError(client.from("categories").select("id,name").is("user_id", null)),
    throwOnError(client.from("categories").select("id,name").eq("user_id", userId)),
    throwOnError(client.from("category_rules").select("id,category_id,keyword").is("user_id", null).eq("active", true)),
    throwOnError(client.from("category_rules")
      .select("id,category_id,keyword,match_fields,match_method,priority")
      .eq("user_id", userId).eq("active", true)),
    throwOnError(client.from("exclusion_rules")
      .select("id,pattern,match_fields,match_method,user_id")
      .is("user_id", null).eq("active", true)),
    throwOnError(client.from("exclusion_rules")
      .select("id,pattern,match_fields,match_method,user_id")
      .eq("user_id", userId).eq("active", true))
  ]);
  const exclusions = [...systemExclusions, ...userExclusions];
  const userCategoryNames = new Map(userCategories.map((category) => [category.id, category.name]));
  return {
    systemCategories: new Map(categories.map((category) => [normalize(category.name), category.id])),
    rules: new Map(categoryRules.map((rule) => [
      `${rule.category_id}:${normalize(rule.keyword)}`,
      rule.id
    ])),
    exclusions: new Map(exclusions.map((rule) => [normalize(rule.pattern), rule.id])),
    systemExclusionCount: systemExclusions.length,
    userExclusions,
    userCategoryRules: userCategoryRules.flatMap((rule) => {
      const categoryName = userCategoryNames.get(rule.category_id);
      return categoryName ? [{ ...rule, category_name: categoryName }] : [];
    })
  };
}

async function loadExistingTransactions(client, userId, source, rows) {
  const existing = new Map();
  const ids = [...new Set(rows.map((row) => row.source_transaction_id))];
  for (const group of chunks(ids)) {
    const data = await throwOnError(
      client.from("transactions")
        .select("id,user_id,source,source_transaction_id,status,category")
        .eq("user_id", userId)
        .eq("source", source)
        .in("source_transaction_id", group)
    );
    for (const transaction of data) {
      existing.set(transactionIdentity(transaction), transaction);
    }
  }
  return existing;
}

async function applyImport({ client, userId, source, filename, checksum, rows, received, failureCount }) {
  const batch = await throwOnError(
    client.from("import_batches").upsert({
      user_id: userId,
      source,
      filename,
      checksum,
      importer_version: IMPORTER_VERSION,
      status: "processing",
      started_at: new Date().toISOString(),
      ended_at: null,
      received_count: received,
      inserted_count: 0,
      updated_count: 0,
      skipped_count: failureCount,
      excluded_count: 0,
      unmatched_count: 0,
      ambiguous_count: 0,
      failed_count: failureCount
    }, { onConflict: "user_id,source,checksum" }).select("id").single()
  );

  try {
    const accountIds = await ensureAccounts(client, userId, rows, source);
    const catalog = await loadSystemCatalog(client, userId);
    const missingCategories = mapping.categories.filter(
      (category) => !catalog.systemCategories.has(normalize(category.name))
    );
    const missingRules = mapping.categories.flatMap((category) => {
      const categoryId = catalog.systemCategories.get(normalize(category.name));
      return category.keywords.filter(
        (keyword) => !catalog.rules.has(`${categoryId}:${normalize(keyword)}`)
      );
    });
    if (
      missingCategories.length > 0 ||
      missingRules.length > 0 ||
      catalog.systemExclusionCount !== mapping.ignored_test_transactions.length
    ) {
      throw new Error("System category seed is missing or inconsistent.");
    }
    const importRows = rows.map((row) => {
      const classification = classifyDescriptions(
        row.original_description,
        row.display_description,
        mapping,
        catalog.userExclusions,
        catalog.userCategoryRules
      );
      return {
        ...row,
        is_excluded: classification.excluded,
        exclusion_pattern: classification.exclusionPattern ?? null,
        matched_exclusion_rule_id: classification.exclusionRuleId ?? null,
        category_name: classification.categoryName,
        matched_keyword: classification.keyword,
        matched_category_id: classification.categoryId ?? null,
        matched_category_rule_id: classification.categoryRuleId ?? null,
        is_ambiguous: classification.ambiguous ?? false,
        is_unmatched: classification.unmatched ?? false
      };
    });

    const existing = await loadExistingTransactions(client, userId, source, importRows);
    const existingIds = [...existing.values()].map((row) => row.id);
    const activeAssignments = existingIds.length
      ? await fetchByIds(
        client,
        "category_assignments",
        "id,transaction_id,assignment_source",
        userId,
        "transaction_id",
        existingIds
      )
      : [];
    const manualTransactionIds = new Set(
      activeAssignments
        .filter((assignment) => assignment.assignment_source === "manual")
        .map((assignment) => assignment.transaction_id)
    );
    const existingBySourceId = new Map([...existing.values()].map((row) => [row.source_transaction_id, row]));

    const transactionRows = importRows.map((row) => {
      const prior = existingBySourceId.get(row.source_transaction_id);
      const manualAssignment = prior && manualTransactionIds.has(prior.id);
      const categoryId = row.category_name
        ? row.matched_category_id ?? catalog.systemCategories.get(normalize(row.category_name))
        : null;
      const categoryRuleId = row.matched_category_rule_id ?? (row.matched_keyword && categoryId
        ? catalog.rules.get(`${categoryId}:${normalize(row.matched_keyword)}`)
        : null);
      const exclusionRuleId = row.matched_exclusion_rule_id ?? (row.exclusion_pattern
        ? catalog.exclusions.get(normalize(row.exclusion_pattern))
        : null);
      if (row.category_name && !categoryId) throw new Error("Category seed is missing a referenced category.");
      if (row.matched_keyword && !categoryRuleId) throw new Error("Category seed is missing a referenced rule.");
      if (row.exclusion_pattern && !exclusionRuleId) throw new Error("Category seed is missing an exclusion rule.");

      return {
        user_id: userId,
        account_id: accountIds.get(row.source_account_id),
        source: row.source,
        source_transaction_id: row.source_transaction_id,
        provider_transaction_id: row.provider_transaction_id,
        amount: row.amount,
        amount_exact: row.amount_exact,
        currency: row.currency,
        description: row.description,
        original_description: row.original_description,
        display_description: row.display_description,
        booked_date: row.booked_date,
        status: prior?.status === "BOOKED" && row.status === "PENDING" ? "BOOKED" : row.status,
        category: manualAssignment ? prior.category : row.is_excluded || row.is_ambiguous ? null : row.category_name,
        is_transfer: row.is_transfer,
        transaction_type: row.transaction_type,
        provider_mutability: row.provider_mutability,
        import_batch_id: batch.id,
        raw_payload: row.raw_payload,
        is_excluded: row.is_excluded,
        exclusion_rule_id: exclusionRuleId
      };
    });

    const savedIds = new Map();
    const upsertResult = await upsertIdempotently(transactionRows, {
      async findExisting(keys) {
        return new Map(keys.flatMap((key) => existing.has(key) ? [[key, existing.get(key)]] : []));
      },
      async upsert(values) {
        for (const group of chunks(values)) {
          const saved = await throwOnError(
            client.from("transactions")
              .upsert(group, { onConflict: "user_id,source,source_transaction_id" })
              .select("id,source_transaction_id")
          );
          for (const row of saved) savedIds.set(row.source_transaction_id, row.id);
        }
      }
    });

    const transactionIds = [...savedIds.values()];
    const assignmentsToReplace = activeAssignments.filter(
      (assignment) => !manualTransactionIds.has(assignment.transaction_id)
    );
    for (const group of chunks(assignmentsToReplace.map((assignment) => assignment.id))) {
      await throwOnError(
        client.from("category_assignments").update({ is_active: false }).in("id", group)
      );
    }

    const assignmentRows = [];
    for (const row of importRows) {
      const transactionId = savedIds.get(row.source_transaction_id);
      if (row.is_excluded || row.is_ambiguous || !row.category_name || manualTransactionIds.has(
        existingBySourceId.get(row.source_transaction_id)?.id
      )) continue;
      const categoryId = row.matched_category_id ?? catalog.systemCategories.get(normalize(row.category_name));
      assignmentRows.push({
        user_id: userId,
        transaction_id: transactionId,
        category_id: categoryId,
        category_rule_id: row.matched_category_rule_id ?? (row.matched_keyword
          ? catalog.rules.get(`${categoryId}:${normalize(row.matched_keyword)}`)
          : null),
        import_batch_id: batch.id,
        assignment_source: row.matched_keyword ? "automatic" : "system"
      });
    }
    for (const group of chunks(assignmentRows)) {
      await throwOnError(client.from("category_assignments").insert(group));
    }

    const excluded = importRows.filter((row) => row.is_excluded).length;
    const unmatched = importRows.filter((row) => row.is_unmatched).length;
    const ambiguous = importRows.filter((row) => row.is_ambiguous).length;
    const failed = failureCount;
    const batchStatus = failed || ambiguous ? "partial" : "completed";
    await throwOnError(client.from("import_batches").update({
      status: batchStatus,
      ended_at: new Date().toISOString(),
      received_count: received,
      inserted_count: upsertResult.inserted,
      updated_count: upsertResult.updated,
      skipped_count: failed,
      excluded_count: excluded,
      unmatched_count: unmatched,
      ambiguous_count: ambiguous,
      failed_count: failed
    }).eq("id", batch.id));

    return {
      batch_id: batch.id,
      received,
      inserted: upsertResult.inserted,
      updated: upsertResult.updated,
      excluded,
      accepted: importRows.length - excluded,
      unmatched,
      ambiguous,
      failed,
      accounts: accountIds.size,
      status: batchStatus
    };
  } catch {
    await throwOnError(client.from("import_batches").update({
      status: "failed",
      ended_at: new Date().toISOString()
    }).eq("id", batch.id));
    throw new Error("Import failed; the batch was marked failed. Transaction payloads were not logged.");
  }
}

export async function runImport(argv = process.argv.slice(2)) {
  const options = getArgs(argv);
  const input = await readFile(path.resolve(options.inputPath));
  const mapping = JSON.parse(await readFile(mappingPath, "utf8"));
  const payload = JSON.parse(input.toString("utf8"));
  const records = transactionRecords(payload);
  const prepared = prepareTransactions(records, mapping, options.source);
  const summary = baseSummary(prepared, records.length);

  if (!options.apply) {
    console.log(JSON.stringify({ mode: "dry-run", ...summary }, null, 2));
    return summary;
  }

  const { url, serviceRoleKey, userId } = requireApplyConfiguration();
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const checksum = createHash("sha256").update(input).digest("hex");
  const result = await applyImport({
    client,
    userId,
    source: options.source,
    filename: path.basename(options.inputPath),
    checksum,
    rows: prepared.transactions,
    received: records.length,
    failureCount: prepared.failures.length
  });
  console.log(JSON.stringify({ mode: "applied", failures_by_code: summary.failures_by_code, ...result }, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await runImport();
  } catch (error) {
    console.error(error.message.startsWith("Usage:") || error.message.startsWith("--apply")
      ? error.message
      : "Import could not be completed. No transaction payloads or credentials were logged.");
    process.exitCode = 1;
  }
}