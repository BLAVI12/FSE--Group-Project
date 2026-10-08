import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  generateCategorySeed,
  stableUuid,
  validateCategoryMapping
} from "../scripts/generate-category-seed.mjs";

const mapping = JSON.parse(
  await readFile(new URL("../supabase/seed-data/transaction-categories.json", import.meta.url), "utf8")
);

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

test("category and rule ids are stable across runs", () => {
  assert.equal(stableUuid("category", "income"), stableUuid("category", "income"));
  assert.notEqual(stableUuid("category", "income"), stableUuid("category", "housing"));
  assert.match(stableUuid("category", "income"), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("generated category SQL is deterministic and idempotent", () => {
  const generated = generateCategorySeed(mapping);
  assert.equal(generated, generateCategorySeed(mapping));
  assert.equal((generated.match(/'contains'/g) ?? []).length, 33);
  assert.equal((generated.match(/on conflict \(id\) do update/g) ?? []).length, 3);
  assert.match(generated, /is distinct from/);
  assert.match(generated, /on conflict \(transaction_id\) where is_active and is_primary do nothing/);
});
