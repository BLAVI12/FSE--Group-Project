import assert from "node:assert/strict";
import test from "node:test";
import { registrationNameData } from "../lib/auth/registration.ts";

test("registration sends separate trimmed names and a compatible display name", () => {
  assert.deepEqual(registrationNameData(" Ada María ", " van Lovelace "), {
    first_name: "Ada María",
    last_name: "van Lovelace",
    display_name: "Ada María van Lovelace",
  });
});

test("registration rejects blank or oversized names", () => {
  assert.equal(registrationNameData("  ", "Lovelace"), null);
  assert.equal(registrationNameData("Ada", ""), null);
  assert.equal(registrationNameData("a".repeat(101), "Lovelace"), null);
  assert.equal(registrationNameData("Ada", "b".repeat(101)), null);
  assert.notEqual(registrationNameData("a".repeat(100), "b".repeat(100)), null);
});
