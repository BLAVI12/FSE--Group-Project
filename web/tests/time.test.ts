import assert from "node:assert/strict";
import test from "node:test";
import { formatGermanDateTime } from "../lib/time.ts";

test("a saved time shows on the German clock, in summer and in winter", () => {
  assert.equal(formatGermanDateTime("2026-10-06T12:24:22Z"), "06/10/2026, 14:24:22 CEST");
  assert.equal(formatGermanDateTime("2026-12-01T12:00:00Z"), "01/12/2026, 13:00:00 CET");
});

test("shortly after midnight in Germany the saved time shows the German date", () => {
  assert.equal(formatGermanDateTime("2026-10-05T22:30:00Z"), "06/10/2026, 00:30:00 CEST");
});
