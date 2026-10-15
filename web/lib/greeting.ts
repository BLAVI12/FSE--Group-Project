export function profileGreeting(firstName: string | null | undefined) {
  const name = firstName?.trim();
  return name ? `Hey, ${name}!` : "Hey!";
}
