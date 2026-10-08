// Exact amounts and keyword categorisation for transactions, shared by the
// Tink sync. Kept from the removed file importer (import-core.js), unchanged:
// the sync writes amount_exact and assigns a category when it saves a new
// transaction.

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function normalizedText(value) {
  return value.normalize("NFKC").toLocaleLowerCase("de-DE");
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
