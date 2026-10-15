import assert from "node:assert/strict";
import test from "node:test";
import {
  USERNAME_HTML_PATTERN,
  validateProfile,
} from "../lib/profile.ts";

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

test("optional address details are stored as null", () => {
  const result = validateProfile({
    username: "student",
    firstName: "Ada",
    lastName: "Lovelace",
    street: "",
    postalCode: "",
    city: "",
    countryCode: "",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.data.street, null);
  assert.equal(result.data.country_code, null);
});

test("profile saves require both names, including when HTML validation is bypassed", () => {
  const result = validateProfile({ ...validProfile, firstName: " ", lastName: "" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errors.firstName, "First name is required.");
  assert.equal(result.errors.lastName, "Last name is required.");
});

test("the username HTML pattern is valid with the browser v regex flag", () => {
  const pattern = new RegExp(`^(?:${USERNAME_HTML_PATTERN})$`, "v");
  assert.equal(pattern.test("student-user"), true);
  assert.equal(pattern.test("student_user"), true);
  assert.equal(pattern.test("student user"), false);
});
