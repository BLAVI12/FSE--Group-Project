export const NAME_MAX_CODEPOINTS = 100;
// HTML maxlength counts UTF-16 units: each accepted codepoint can use two.
export const NAME_INPUT_MAX_LENGTH = NAME_MAX_CODEPOINTS * 2;

export function requiredNameError(value: string, label: string) {
  const name = value.trim();
  if (!name) return `${label} is required.`;
  if ([...name].length > NAME_MAX_CODEPOINTS) {
    return `${label} must be ${NAME_MAX_CODEPOINTS} characters or fewer.`;
  }
}
