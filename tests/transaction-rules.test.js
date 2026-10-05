import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { classifyDescriptions, exactDecimal } from "../src/features/transactions/transaction-rules.js";
import { toCents } from "../supabase/functions/_shared/tink/convert.ts";

const mapping = JSON.parse(
  await readFile(new URL("../supabase/seed-data/transaction-categories.json", import.meta.url), "utf8")
);
const fixture = JSON.parse(
  await readFile(new URL("./fixtures/tink-demo-fixture.json", import.meta.url), "utf8")
);

/** Integer cents as the shortest exact decimal, the format exactDecimal returns. */
function centsAsDecimal(cents) {
  const sign = cents < 0 ? "-" : "";
  const digits = String(Math.abs(cents)).padStart(3, "0");
  const fraction = digits.slice(-2).replace(/0+$/, "");
  return `${sign}${digits.slice(0, -2)}${fraction ? `.${fraction}` : ""}`;
}

test("exact amount conversion handles scale one, scale two, signs, and zero without floats", () => {
  assert.equal(exactDecimal("123", 1), "12.3");
  assert.equal(exactDecimal("105", 2), "1.05");
  assert.equal(exactDecimal("-105", 2), "-1.05");
  assert.equal(exactDecimal("0", 2), "0");
  assert.equal(exactDecimal("7", 0), "7");
});

test("exact amounts of the 309 real Demo Bank transactions agree with the cents conversion", () => {
  // Tink sends the scale as text ("1"), so callers convert it with Number().
  for (const { amount } of fixture.transactions) {
    const { unscaledValue, scale } = amount.value;
    assert.equal(exactDecimal(unscaledValue, Number(scale)), centsAsDecimal(toCents(amount.value)), unscaledValue);
  }
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
