export function registrationNameData(firstName: string, lastName: string) {
  const first = firstName.trim();
  const last = lastName.trim();
  if (!first || !last || [...first].length > 100 || [...last].length > 100) {
    return null;
  }
  return {
    first_name: first,
    last_name: last,
    display_name: `${first} ${last}`,
  };
}
