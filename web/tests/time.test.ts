import assert from "node:assert/strict";
import test from "node:test";
import { formatGermanDateTime, getGermanMonthKey } from "../lib/time.ts";

test("a saved time shows on the German clock, in summer and in winter", () => {
  assert.equal(formatGermanDateTime("2026-10-06T12:24:22Z"), "06/10/2026, 14:24:22 CEST");
  assert.equal(formatGermanDateTime("2026-12-01T12:00:00Z"), "01/12/2026, 13:00:00 CET");
});

test("shortly after midnight in Germany the saved time shows the German date", () => {
  assert.equal(formatGermanDateTime("2026-10-05T22:30:00Z"), "06/10/2026, 00:30:00 CEST");
});

test("the month changes at midnight in Germany, not at UTC midnight", () => {
  assert.equal(getGermanMonthKey(new Date("2026-10-31T22:59:59Z")), "2026-10");
  assert.equal(getGermanMonthKey(new Date("2026-10-31T23:00:00Z")), "2026-11");
  assert.equal(getGermanMonthKey(new Date("2026-12-31T23:00:00Z")), "2027-01");
});
