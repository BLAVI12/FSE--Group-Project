import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

import {
  stableUuid,
  validateCategoryMapping
} from "../src/features/transactions/import-core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = path.join(root, "supabase/seed-data/transaction-categories.json");
const outputPath = path.join(root, "supabase/seeds/transaction-categories.sql");

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function normalize(value) {
  return value.normalize("NFKC").toLocaleLowerCase("de-DE");
}

export function generateCategorySeed(mapping) {
  validateCategoryMapping(mapping);
  const statements = [
    "-- Generated from seed-data/transaction-categories.json; do not edit by hand.",
    "begin;",
    "insert into public.categories (id, user_id, name) values"
  ];

  statements.push(mapping.categories.map((category) => {
    const id = stableUuid("category", normalize(category.name));
    return `  ('${id}', null, ${sqlString(category.name)})`;
  }).join(",\n") + "\non conflict (id) do update set name = excluded.name, updated_at = now()\n" +
    "where public.categories.name is distinct from excluded.name;");

  const rules = [];
  let priority = 0;
  for (const category of mapping.categories) {
    const categoryId = stableUuid("category", normalize(category.name));
    for (const keyword of category.keywords) {
      const normalizedKeyword = normalize(keyword.trim());
      const id = stableUuid("category-rule", `${categoryId}:${normalizedKeyword}`);
      rules.push(
        `  ('${id}', null, '${categoryId}', ${sqlString(keyword)}, ${sqlString(normalizedKeyword)}, ` +
        `array['original', 'display']::text[], 'contains', ${priority}, true)`
      );
      priority += 1;
    }
  }

  statements.push("insert into public.category_rules (\n" +
    "    id, user_id, category_id, keyword, normalized_keyword, match_fields, match_method, priority, active\n" +
    ") values\n" + rules.join(",\n") +
    "\non conflict (id) do update set\n" +
    "    category_id = excluded.category_id, keyword = excluded.keyword,\n" +
    "    normalized_keyword = excluded.normalized_keyword, match_fields = excluded.match_fields,\n" +
    "    match_method = excluded.match_method, priority = excluded.priority, active = excluded.active,\n" +
    "    updated_at = now()\n" +
    "where (public.category_rules.category_id, public.category_rules.keyword,\n" +
    "       public.category_rules.normalized_keyword, public.category_rules.match_fields,\n" +
    "       public.category_rules.match_method, public.category_rules.priority, public.category_rules.active)\n" +
    "  is distinct from (excluded.category_id, excluded.keyword, excluded.normalized_keyword,\n" +
    "                   excluded.match_fields, excluded.match_method, excluded.priority, excluded.active);");

  const exclusions = mapping.ignored_test_transactions.map((pattern) => {
    const normalizedPattern = normalize(pattern.trim());
    const id = stableUuid("exclusion-rule", normalizedPattern);
    return `  ('${id}', null, ${sqlString(pattern)}, ${sqlString(normalizedPattern)}, ` +
      `array['original', 'display']::text[], 'contains', ` +
      "'Known test-transaction description supplied with the category mapping', true)";
  });
  statements.push("insert into public.exclusion_rules (\n" +
    "    id, user_id, pattern, normalized_pattern, match_fields, match_method, reason, active\n" +
    ") values\n" + exclusions.join(",\n") +
    "\non conflict (id) do update set\n" +
    "    pattern = excluded.pattern, normalized_pattern = excluded.normalized_pattern,\n" +
    "    match_fields = excluded.match_fields, match_method = excluded.match_method,\n" +
    "    reason = excluded.reason, active = excluded.active, updated_at = now()\n" +
    "where (public.exclusion_rules.pattern, public.exclusion_rules.normalized_pattern,\n" +
    "       public.exclusion_rules.match_fields, public.exclusion_rules.match_method,\n" +
    "       public.exclusion_rules.reason, public.exclusion_rules.active)\n" +
    "  is distinct from (excluded.pattern, excluded.normalized_pattern, excluded.match_fields,\n" +
    "                   excluded.match_method, excluded.reason, excluded.active);");

  statements.push("insert into public.category_assignments (user_id, transaction_id, category_id, assignment_source)\n" +
    "select t.user_id, t.id, c.id, 'manual'\n" +
    "  from public.transactions t\n" +
    "  join public.categories c on lower(c.name) = lower(t.category) and c.user_id is null\n" +
    " where t.category is not null\n" +
    "   and not exists (select 1 from public.category_assignments a\n" +
    "                    where a.transaction_id = t.id and a.is_active and a.is_primary)\n" +
    "on conflict (transaction_id) where is_active and is_primary do nothing;");
  statements.push("commit;", "");
  return statements.join("\n\n");
}

async function main() {
  const mapping = JSON.parse(await readFile(inputPath, "utf8"));
  const generated = generateCategorySeed(mapping);
  if (process.argv.includes("--check")) {
    const current = await readFile(outputPath, "utf8").catch(() => null);
    if (current !== generated) {
      console.error("Category SQL seed is missing or out of date; run npm run generate:category-seed.");
      process.exitCode = 1;
      return;
    }
    console.log("Category JSON and SQL seed are valid and synchronized.");
    return;
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, generated, "utf8");
  console.log("Generated supabase/seeds/transaction-categories.sql.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}