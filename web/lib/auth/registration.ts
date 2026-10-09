import { requiredNameError } from "../names.ts";

export function registrationNameData(firstName: string, lastName: string) {
  const first = firstName.trim();
  const last = lastName.trim();
  if (requiredNameError(first, "First name") || requiredNameError(last, "Last name")) {
    return null;
  }
  return {
    first_name: first,
    last_name: last,
    display_name: `${first} ${last}`,
  };
}
