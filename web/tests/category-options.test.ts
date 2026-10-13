import assert from "node:assert/strict";
import test from "node:test";
import { categorizeTransactions } from "../lib/data/categories.ts";
import { categoryIdToSave, categoryMenuOptions, categoryNameAfterSave } from "../lib/data/category-options.ts";

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

test("right after choosing Automatic the row shows the rules' choice, as the export and a reload do", () => {
  const all = [...categories, { id: "food-id", name: "Food" }];
  assert.equal(categoryNameAfterSave(null, all, "Aldi"), "Groceries");
  assert.equal(categoryNameAfterSave(null, all, "Unknown merchant"), "Uncategorized");
  assert.equal(
    categoryNameAfterSave(null, all, "Aldi"),
    categorizeTransactions([{ category: null, description: "Aldi" }])[0].category,
  );
  assert.equal(categoryNameAfterSave("food-id", all, "Aldi"), "Food");
});
