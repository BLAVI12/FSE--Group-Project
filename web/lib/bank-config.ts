import "server-only";

export function isBankConfigured() {
  const names = ["DATABASE_URL", "TINK_CLIENT_ID", "TINK_CLIENT_SECRET", "TINK_REDIRECT_URI"];
  if (!names.every((name) => Boolean(process.env[name])) || process.env.TINK_TEST_MODE === "false") return false;
  try {
    const host = new URL(process.env.DATABASE_URL!).hostname;
    return ["localhost", "127.0.0.1", "[::1]"].includes(host) || Boolean(process.env.DATABASE_CA_CERT);
  } catch {
    return false;
  }
}
