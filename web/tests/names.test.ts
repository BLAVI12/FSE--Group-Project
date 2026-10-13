import assert from "node:assert/strict";
import test from "node:test";
import { registrationNameData } from "../lib/auth/registration.ts";
import { validateProfile } from "../lib/profile.ts";
import { NAME_INPUT_MAX_LENGTH, requiredNameError } from "../lib/names.ts";

test("registration and profile agree on Unicode codepoint boundaries", () => {
  for (const character of ["a", "𠮷", "😀"]) {
    for (const length of [100, 101]) {
      const name = character.repeat(length);
      assert.equal(Boolean(registrationNameData(name, "Student")), length <= 100);
      assert.equal(validateProfile({ username: "student", firstName: name, lastName: "Student", street: "", postalCode: "", city: "", countryCode: "" }).ok, length <= 100);
      assert.equal(Boolean(registrationNameData("Student", name)), length <= 100);
    }
  }
  assert.equal("𠮷".repeat(100).length <= NAME_INPUT_MAX_LENGTH, true);
});

test("shared name validation trims values and rejects whitespace-only input", () => {
  assert.equal(requiredNameError("  Ada  ", "First name"), undefined);
  assert.equal(requiredNameError(" \t\n ", "First name"), "First name is required.");
});
