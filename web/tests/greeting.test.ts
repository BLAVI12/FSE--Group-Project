import assert from "node:assert/strict";
import test from "node:test";
import { profileGreeting } from "../lib/greeting.ts";

test("greeting uses the saved first name without splitting compound names", () => {
  assert.equal(profileGreeting(" Ada María "), "Hey, Ada María!");
});

test("missing names use a neutral greeting instead of email or user id", () => {
  for (const name of [null, undefined, "", "   "]) {
    assert.equal(profileGreeting(name), "Hey!");
  }
});
