import assert from "node:assert/strict";
import test from "node:test";
import { categoryIdToSave, categoryMenuOptions } from "../lib/data/category-options.ts";

const categories = [
  { id: "groceries-id", name: "Groceries" },
  { id: "uncategorized-id", name: "Uncategorized" },
];

test("the category menu offers Automatic and the real Uncategorized category as distinct options", () => {
  const labels = categoryMenuOptions(categories).map((option) => option.label);
  assert.deepEqual(labels, ["Automatic", "Groceries", "Uncategorized"]);
  assert.equal(labels.filter((label) => label === "Uncategorized").length, 1);
});

test("Automatic saves no category, Uncategorized saves the real category", () => {
  const [automatic, , uncategorized] = categoryMenuOptions(categories);
  assert.equal(categoryIdToSave(automatic.value), null);
  assert.equal(categoryIdToSave(uncategorized.value), "uncategorized-id");
});
