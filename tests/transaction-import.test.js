import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateCategorySeed } from "../scripts/generate-category-seed.mjs";
import { runImport } from "../scripts/import-transactions.mjs";
import {
  classifyDescriptions,
  exactDecimal,
  exactMinorUnits,
  normalizeTransaction,
  prepareTransactions,
  reconcileTransaction,
  stableUuid,
  upsertIdempotently,
  validateCategoryMapping
} from "../src/features/transactions/import-core.js";

const mapping = JSON.parse(
  await readFile(new URL("../supabase/seed-data/transaction-categories.json", import.meta.url), "utf8")
);

function transaction(overrides = {}) {
  return {
    id: "source-1",
    accountId: "account-1",
    identifiers: { providerTransactionId: "provider-1" },
    amount: { value: { unscaledValue: "-1234", scale: 2, currencyCode: "EUR" } },
    descriptions: { original: "coffee shop", display: "Coffee Fellows" },
    dates: { booked: "2026-09-26" },
    status: "BOOKED",
    type: "DEFAULT",
    mutability: "MUTABLE",
    ...overrides
  };
}

test("canonical category mapping validates category names, keywords, and exclusions", () => {
  assert.deepEqual(validateCategoryMapping(mapping), {
    categories: 14,
    keywords: 30,
    exclusions: 3
  });
  assert.throws(
    () => validateCategoryMapping({
      ...mapping,
      categories: mapping.categories.filter((category) => category.name !== "Uncategorized")
    }),
    /missing_uncategorized_category/
  );
});

test("exact amount conversion handles scale one, scale two, signs, and zero without floats", () => {
  assert.equal(exactDecimal("123", 1), "12.3");
  assert.equal(exactDecimal("105", 2), "1.05");
  assert.equal(exactDecimal("-105", 2), "-1.05");
  assert.equal(exactDecimal("0", 2), "0");
  assert.equal(exactDecimal("7", 0), "7");
  assert.equal(exactMinorUnits("123", 1), "1230");
  assert.equal(exactMinorUnits("105", 2), "105");
  assert.equal(exactMinorUnits("-105", 2), "-105");
  assert.equal(exactMinorUnits("0", 2), "0");
  assert.equal(exactMinorUnits("123", 3), "12");
  assert.equal(exactMinorUnits("1255", 3), "126");
  assert.equal(exactMinorUnits("-1255", 3), "-126");
});

test("category matching is case-insensitive across original and display descriptions", () => {
  assert.equal(classifyDescriptions(" salary payment ", "unrelated", mapping).categoryName, "Income");
  assert.equal(classifyDescriptions("unrelated", "cOfFeE fElLoWs", mapping).categoryName, "Dining & Coffee");
});

test("custom rules honor configured fields and remain ambiguous against system matches", () => {
  const customExclusions = [{
    id: "exclude-1",
    pattern: "ignore this",
    match_fields: ["display"],
    match_method: "exact"
  }];
  const excluded = classifyDescriptions("Salary", "IGNORE THIS", mapping, customExclusions);
  assert.equal(excluded.excluded, true);
  assert.equal(excluded.exclusionRuleId, "exclude-1");

  const customRules = [{
    id: "rule-1",
    category_id: "category-1",
    category_name: "Personal",
    keyword: "special shop",
    match_fields: ["original"],
    match_method: "contains",
    priority: 10
  }];
  const customMatch = classifyDescriptions("Special Shop West", "Unknown", mapping, [], customRules);
  assert.equal(customMatch.categoryName, "Personal");
  assert.equal(customMatch.categoryId, "category-1");
  const conflict = classifyDescriptions("Special Shop", "Salary", mapping, [], customRules);
  assert.equal(conflict.ambiguous, true);
});

test("exclusion rules run before category rules", () => {
  const result = classifyDescriptions("checkDestinationIBAN Salary", "Salary", mapping);
  assert.equal(result.excluded, true);
  assert.equal(result.exclusionPattern, "checkDestinationIBAN");
  assert.equal(result.categoryName, null);
});

test("unmatched descriptions become Uncategorized and multi-category hits remain ambiguous", () => {
  assert.equal(classifyDescriptions("unknown merchant", "", mapping).categoryName, "Uncategorized");
  const ambiguousMapping = {
    ...mapping,
    categories: mapping.categories.map((category) =>
      category.name === "Housing" ? { ...category, keywords: [...category.keywords, "Aldi"] } : category
    )
  };
  const result = classifyDescriptions("Aldi", "", ambiguousMapping);
  assert.equal(result.ambiguous, true);
  assert.equal(result.categoryName, null);
});

test("normalization preserves identifiers, descriptions, exact amounts, and raw records", () => {
  const raw = transaction();
  const normalized = normalizeTransaction(raw, mapping);
  assert.equal(normalized.amount_exact, "-12.34");
  assert.equal(normalized.amount, "-1234");
  assert.equal(normalized.original_description, "coffee shop");
  assert.equal(normalized.display_description, "Coffee Fellows");
  assert.equal(normalized.category_name, "Dining & Coffee");
  assert.equal(normalized.raw_payload, raw);
});

test("duplicate transaction IDs and duplicate account/provider IDs are rejected", () => {
  const result = prepareTransactions([
    transaction(),
    transaction({ accountId: "account-2", identifiers: { providerTransactionId: "provider-2" } }),
    transaction({ id: "source-2" })
  ], mapping);
  assert.equal(result.transactions.length, 1);
  assert.deepEqual(result.failures, [
    { record_index: 1, code: "duplicate_source_identifier" },
    { record_index: 2, code: "duplicate_source_identifier" }
  ]);
});

test("source keys are deterministic and repeated upserts do not insert duplicates", async () => {
  assert.equal(stableUuid("category", "Income"), stableUuid("category", "Income"));
  const store = new Map();
  const repository = {
    async findExisting(keys) {
      return new Map(keys.flatMap((key) => store.has(key) ? [[key, store.get(key)]] : []));
    },
    async upsert(rows) {
      for (const row of rows) {
        store.set(JSON.stringify([row.user_id, row.source, row.source_transaction_id]), row);
      }
    }
  };
  const row = { user_id: "user-1", source: "statement", source_transaction_id: "source-1", status: "BOOKED" };
  assert.deepEqual(await upsertIdempotently([row], repository), { inserted: 1, updated: 0 });
  assert.deepEqual(await upsertIdempotently([row], repository), { inserted: 0, updated: 1 });
  assert.equal(store.size, 1);
});

test("pending transactions promote to booked and never regress", () => {
  assert.equal(reconcileTransaction({ status: "PENDING" }, { status: "BOOKED" }).status, "BOOKED");
  assert.equal(reconcileTransaction({ status: "BOOKED" }, { status: "PENDING" }).status, "BOOKED");
  assert.equal(normalizeTransaction(transaction({ status: "PENDING", dates: {} }), mapping).booked_date, null);
});

test("generated category SQL is deterministic and idempotent", () => {
  const generated = generateCategorySeed(mapping);
  assert.equal(generated, generateCategorySeed(mapping));
  assert.equal((generated.match(/'contains'/g) ?? []).length, 33);
  assert.equal((generated.match(/on conflict \(id\) do update/g) ?? []).length, 3);
  assert.match(generated, /is distinct from/);
  assert.match(generated, /on conflict \(transaction_id\) where is_active and is_primary do nothing/);
});

test("dry-run importer reports aggregate counts without printing descriptions", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "transaction-import-"));
  const inputPath = path.join(directory, "sample.json");
  const records = [
    transaction(),
    transaction({
      id: "source-2",
      accountId: "account-2",
      identifiers: { providerTransactionId: "provider-2" },
      descriptions: { original: "checkDestinationIBAN", display: "checkDestinationIBAN" }
    })
  ];
  await writeFile(inputPath, JSON.stringify({ transactions: records }));
  const output = [];
  const originalLog = console.log;
  console.log = (line) => output.push(line);
  try {
    const summary = await runImport([inputPath]);
    assert.equal(summary.received, 2);
    assert.equal(summary.accounts, 2);
    assert.equal(summary.excluded, 1);
    assert.equal(summary.accepted, 1);
    assert.equal(output.join("\n").includes("Coffee Fellows"), false);
    assert.equal(output.join("\n").includes("checkDestinationIBAN"), false);
  } finally {
    console.log = originalLog;
    await rm(directory, { recursive: true, force: true });
  }
});