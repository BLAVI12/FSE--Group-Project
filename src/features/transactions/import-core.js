import { createHash } from "node:crypto";

export const IMPORTER_VERSION = "1.0.0";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function normalizedText(value) {
  return value.normalize("NFKC").toLocaleLowerCase("de-DE");
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

export function validateCategoryMapping(mapping) {
  if (!mapping || !Array.isArray(mapping.categories) || !Array.isArray(mapping.ignored_test_transactions)) {
    fail("invalid_category_mapping");
  }

  if (mapping.categories.length !== 17 || mapping.ignored_test_transactions.length !== 3) {
    fail("unexpected_mapping_counts");
  }

  const categoryNames = new Set();
  let keywordCount = 0;
  for (const category of mapping.categories) {
    if (!nonEmptyString(category.name) || !Array.isArray(category.keywords)) {
      fail("invalid_category_entry");
    }
    const normalizedName = normalizedText(category.name.trim());
    if (categoryNames.has(normalizedName)) {
      fail("duplicate_category_name");
    }
    categoryNames.add(normalizedName);
    for (const keyword of category.keywords) {
      if (!nonEmptyString(keyword)) {
        fail("invalid_category_keyword");
      }
      keywordCount += 1;
    }
  }

  if (keywordCount !== 48 || !categoryNames.has("uncategorized")) {
    fail("unexpected_keyword_count");
  }
  if (mapping.ignored_test_transactions.some((pattern) => !nonEmptyString(pattern))) {
    fail("invalid_exclusion_pattern");
  }

  return { categories: mapping.categories.length, keywords: keywordCount, exclusions: 3 };
}

export function stableUuid(namespace, value) {
  const hex = createHash("sha256").update(`${namespace}:${value}`).digest("hex").slice(0, 32);
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13)}`;
  const variant = ((Number.parseInt(versioned[16], 16) & 0x3) | 0x8).toString(16);
  const normalized = `${versioned.slice(0, 16)}${variant}${versioned.slice(17)}`;
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`;
}

export function exactDecimal(unscaledValue, scale) {
  const digits = typeof unscaledValue === "bigint"
    ? unscaledValue.toString()
    : typeof unscaledValue === "string"
      ? unscaledValue
      : Number.isSafeInteger(unscaledValue)
        ? String(unscaledValue)
        : null;

  if (!digits || !/^-?\d+$/.test(digits) || !Number.isSafeInteger(scale) || scale < 0 || scale > 1000) {
    fail("invalid_amount");
  }

  const negative = digits.startsWith("-");
  const unsigned = negative ? digits.slice(1) : digits;
  if (scale === 0) {
    return `${negative && BigInt(digits) !== 0n ? "-" : ""}${unsigned}`;
  }

  const padded = unsigned.padStart(scale + 1, "0");
  const integerPart = padded.slice(0, -scale);
  const fractionalPart = padded.slice(-scale).replace(/0+$/, "");
  if (!fractionalPart) {
    return `${negative && BigInt(digits) !== 0n ? "-" : ""}${integerPart}`;
  }
  return `${negative ? "-" : ""}${integerPart}.${fractionalPart}`;
}

export function exactMinorUnits(unscaledValue, scale) {
  let value;
  try {
    value = BigInt(unscaledValue);
  } catch {
    fail("invalid_amount");
  }
  if (!Number.isSafeInteger(scale) || scale < 0 || scale > 1000) {
    fail("invalid_amount");
  }
  if (scale <= 2) {
    return (value * 10n ** BigInt(2 - scale)).toString();
  }
  const divisor = 10n ** BigInt(scale - 2);
  const quotient = value / divisor;
  const remainder = value % divisor;
  if ((remainder < 0n ? -remainder : remainder) * 2n < divisor) {
    return quotient.toString();
  }
  return (quotient + (value < 0n ? -1n : 1n)).toString();
}

function firstString(...values) {
  return values.find((value) => typeof value === "string") ?? null;
}

function requireString(value, code) {
  if (!nonEmptyString(value)) {
    fail(code);
  }
  return value.trim();
}

function normalizeDate(value, status) {
  if (!nonEmptyString(value)) {
    if (status === "PENDING") return null;
    fail("missing_booked_date");
  }
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    fail("invalid_booked_date");
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    fail("invalid_booked_date");
  }
  return date;
}

function matchesPattern(pattern, fields, matchMethod = "contains") {
  const needle = normalizedText(pattern);
  return fields.some((field) => {
    const haystack = normalizedText(field ?? "");
    return matchMethod === "exact" ? haystack === needle : haystack.includes(needle);
  });
}

export function matchesDescriptionRule(original, display, rule) {
  const available = { original: original ?? "", display: display ?? "" };
  const fields = (rule.match_fields ?? ["original", "display"])
    .map((field) => available[field])
    .filter((field) => typeof field === "string");
  return matchesPattern(rule.pattern ?? rule.keyword, fields, rule.match_method ?? "contains");
}

export function classifyDescriptions(
  original,
  display,
  mapping,
  extraExclusions = [],
  extraCategoryRules = []
) {
  const fields = [original, display];
  const exclusionPattern = mapping.ignored_test_transactions.find((pattern) =>
    matchesPattern(pattern, fields)
  );
  if (exclusionPattern) {
    return { excluded: true, exclusionPattern, categoryName: null, keyword: null };
  }
  const extraExclusion = extraExclusions.find((rule) => matchesDescriptionRule(original, display, rule));
  if (extraExclusion) {
    return {
      excluded: true,
      exclusionPattern: extraExclusion.pattern,
      exclusionRuleId: extraExclusion.id,
      categoryName: null,
      keyword: null
    };
  }

  const hits = [];
  let priority = 0;
  for (const category of mapping.categories) {
    for (const keyword of category.keywords) {
      if (matchesPattern(keyword, fields)) {
        hits.push({
          categoryKey: `system:${normalizedText(category.name)}`,
          categoryName: category.name,
          keyword,
          priority
        });
      }
      priority += 1;
    }
  }

  for (const rule of extraCategoryRules) {
    if (matchesDescriptionRule(original, display, rule)) {
      hits.push({
        categoryKey: `user:${rule.category_id}`,
        categoryName: rule.category_name,
        categoryId: rule.category_id,
        categoryRuleId: rule.id,
        keyword: rule.keyword,
        priority: rule.priority
      });
    }
  }

  const uniqueCategories = new Set(hits.map((hit) => hit.categoryKey));
  if (uniqueCategories.size > 1) {
    return { excluded: false, ambiguous: true, categoryName: null, keyword: null };
  }
  if (hits.length === 0) {
    return {
      excluded: false,
      ambiguous: false,
      unmatched: true,
      categoryName: mapping.categories.find((category) => category.name === "Uncategorized").name,
      categoryId: null,
      categoryRuleId: null,
      keyword: null
    };
  }

  hits.sort((left, right) => right.keyword.length - left.keyword.length || left.priority - right.priority);
  return {
    excluded: false,
    ambiguous: false,
    unmatched: false,
    categoryName: hits[0].categoryName,
    categoryId: hits[0].categoryId ?? null,
    categoryRuleId: hits[0].categoryRuleId ?? null,
    keyword: hits[0].keyword
  };
}

export function normalizeTransaction(record, mapping, source = "transaction-json") {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    fail("invalid_transaction");
  }

  const amountValue = record.amount?.value;
  const unscaledValue = amountValue?.unscaledValue;
  const scale = amountValue?.scale;
  const original = firstString(record.descriptions?.original, record.originalDescription, record.description);
  const display = firstString(record.descriptions?.display, record.displayDescription, record.description);
  const originalDescription = original ?? display ?? "";
  const displayDescription = display ?? original ?? "";
  const transactionId = firstString(record.id, record.transactionId, record.sourceTransactionId);
  const accountId = firstString(record.accountId, record.sourceAccountId, record.account?.id);
  const providerTransactionId = firstString(
    record.identifiers?.providerTransactionId,
    record.providerTransactionId
  );
  const currency = firstString(
    amountValue?.currencyCode,
    record.amount?.currencyCode,
    record.currencyCode,
    record.currency
  );
  const bookedDate = firstString(
    record.dates?.booked,
    record.dates?.bookedDate,
    record.dates?.value,
    record.dates?.date,
    record.bookedDate,
    record.booked_date,
    record.date
  );
  const status = firstString(record.status, record.transactionStatus)?.toUpperCase();
  if (status !== "BOOKED" && status !== "PENDING") {
    fail("invalid_status");
  }
  if (!Number.isSafeInteger(scale)) {
    fail("invalid_amount");
  }

  const transactionType = firstString(record.type, record.transactionType);
  const mutability = firstString(record.mutability, record.providerMutability);
  const classification = classifyDescriptions(originalDescription, displayDescription, mapping);
  const normalizedCurrency = requireString(currency, "missing_currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    fail("invalid_currency");
  }

  return {
    source: requireString(source, "invalid_source"),
    source_transaction_id: requireString(transactionId, "missing_source_transaction_id"),
    source_account_id: requireString(accountId, "missing_source_account_id"),
    provider_transaction_id: requireString(providerTransactionId, "missing_provider_transaction_id"),
    amount_exact: exactDecimal(unscaledValue, scale),
    amount: exactMinorUnits(unscaledValue, scale),
    currency: normalizedCurrency,
    original_description: originalDescription,
    display_description: displayDescription,
    description: displayDescription || originalDescription,
    booked_date: normalizeDate(bookedDate, status),
    status,
    transaction_type: transactionType,
    provider_mutability: mutability,
    is_transfer: typeof transactionType === "string" && transactionType.toUpperCase() === "TRANSFER",
    is_excluded: classification.excluded,
    exclusion_pattern: classification.exclusionPattern ?? null,
    category_name: classification.categoryName,
    matched_keyword: classification.keyword,
    matched_category_id: classification.categoryId ?? null,
    matched_category_rule_id: classification.categoryRuleId ?? null,
    is_ambiguous: classification.ambiguous ?? false,
    is_unmatched: classification.unmatched ?? false,
    raw_payload: record
  };
}

export function prepareTransactions(records, mapping, source = "transaction-json") {
  validateCategoryMapping(mapping);
  if (!Array.isArray(records)) {
    fail("invalid_transaction_collection");
  }

  const transactions = [];
  const failures = [];
  const sourceIds = new Set();
  const providerPairs = new Set();

  records.forEach((record, recordIndex) => {
    try {
      const transaction = normalizeTransaction(record, mapping, source);
      const sourceKey = JSON.stringify([source, transaction.source_transaction_id]);
      const providerKey = JSON.stringify([
        transaction.source_account_id,
        transaction.provider_transaction_id
      ]);
      if (sourceIds.has(sourceKey) || providerPairs.has(providerKey)) {
        fail("duplicate_source_identifier");
      }
      sourceIds.add(sourceKey);
      providerPairs.add(providerKey);
      transactions.push({ ...transaction, record_index: recordIndex });
    } catch (error) {
      failures.push({ record_index: recordIndex, code: error.code ?? "invalid_transaction" });
    }
  });

  return { transactions, failures };
}

export function transactionIdentity(row) {
  return JSON.stringify([row.user_id, row.source, row.source_transaction_id]);
}

export function reconcileTransaction(existing, incoming) {
  if (existing?.status === "BOOKED" && incoming.status === "PENDING") {
    return { ...incoming, status: "BOOKED" };
  }
  return incoming;
}

export async function upsertIdempotently(rows, repository) {
  const keys = rows.map(transactionIdentity);
  const existing = await repository.findExisting(keys);
  const merged = rows.map((row, index) => {
    const previous = existing.get(keys[index]);
    return previous ? reconcileTransaction(previous, row) : row;
  });
  await repository.upsert(merged);
  return {
    inserted: rows.length - existing.size,
    updated: existing.size
  };
}