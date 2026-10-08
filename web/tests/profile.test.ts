import assert from "node:assert/strict";
import test from "node:test";
import { validateProfile } from "../lib/profile.ts";

const validProfile = {
  username: " Student_User ",
  firstName: " Ada ",
  lastName: " Lovelace ",
  street: " 1 Example Street ",
  postalCode: " 10115 ",
  city: " Berlin ",
  countryCode: " de ",
};

test("profile validation normalises safe profile data", () => {
  const result = validateProfile(validProfile);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.data, {
    username: "student_user",
    first_name: "Ada",
    last_name: "Lovelace",
    street: "1 Example Street",
    postal_code: "10115",
    city: "Berlin",
    country_code: "DE",
  });
});

test("profile validation rejects unsafe usernames and country codes", () => {
  const result = validateProfile({
    ...validProfile,
    username: "not allowed!",
    countryCode: "Germany",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.match(result.errors.username ?? "", /3–30/);
  assert.match(result.errors.countryCode ?? "", /two-letter/);
});

test("optional personal details are stored as null", () => {
  const result = validateProfile({
    username: "student",
    firstName: " ",
    lastName: "",
    street: "",
    postalCode: "",
    city: "",
    countryCode: "",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.data.first_name, null);
  assert.equal(result.data.country_code, null);
});

