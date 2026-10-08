export const PROFILE_LIMITS = {
  username: 30,
  firstName: 100,
  lastName: 100,
  street: 200,
  postalCode: 20,
  city: 100,
} as const;

// HTML compiles pattern attributes with the Unicode Sets (`v`) flag, where a
// literal hyphen in a character class must be escaped.
export const USERNAME_HTML_PATTERN =
  "[A-Za-z0-9][A-Za-z0-9_\\-]{2,29}";

export type ProfileValues = {
  username: string;
  firstName: string;
  lastName: string;
  street: string;
  postalCode: string;
  city: string;
  countryCode: string;
};

export type ProfileField = keyof ProfileValues;

export type ProfileFormState = {
  status: "idle" | "success" | "error";
  message: string;
  errors?: Partial<Record<ProfileField, string>>;
};

export type ValidProfile = {
  username: string;
  first_name: string | null;
  last_name: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country_code: string | null;
};

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function profileValuesFromFormData(formData: FormData): ProfileValues {
  return {
    username: String(formData.get("username") ?? ""),
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    street: String(formData.get("street") ?? ""),
    postalCode: String(formData.get("postalCode") ?? ""),
    city: String(formData.get("city") ?? ""),
    countryCode: String(formData.get("countryCode") ?? ""),
  };
}

export function validateProfile(values: ProfileValues):
  | { ok: true; data: ValidProfile }
  | {
      ok: false;
      errors: Partial<Record<ProfileField, string>>;
    } {
  const username = values.username.trim().toLowerCase();
  const firstName = optional(values.firstName);
  const lastName = optional(values.lastName);
  const street = optional(values.street);
  const postalCode = optional(values.postalCode);
  const city = optional(values.city);
  const countryCode = optional(values.countryCode)?.toUpperCase() ?? null;
  const errors: Partial<Record<ProfileField, string>> = {};

  if (!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(username)) {
    errors.username =
      "Use 3–30 lowercase letters, numbers, underscores or hyphens.";
  }

  const lengths: Array<[
    ProfileField,
    string | null,
    number,
    string,
  ]> = [
    ["firstName", firstName, PROFILE_LIMITS.firstName, "First name"],
    ["lastName", lastName, PROFILE_LIMITS.lastName, "Last name"],
    ["street", street, PROFILE_LIMITS.street, "Street"],
    ["postalCode", postalCode, PROFILE_LIMITS.postalCode, "Postal code"],
    ["city", city, PROFILE_LIMITS.city, "City"],
  ];

  for (const [field, value, maximum, label] of lengths) {
    if (value && value.length > maximum) {
      errors[field] = `${label} must be ${maximum} characters or fewer.`;
    }
  }

  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
    errors.countryCode = "Use a two-letter country code, for example DE.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      username,
      first_name: firstName,
      last_name: lastName,
      street,
      postal_code: postalCode,
      city,
      country_code: countryCode,
    },
  };
}
