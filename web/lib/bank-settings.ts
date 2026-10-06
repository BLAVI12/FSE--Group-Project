// Which bank settings the server is missing. The dashboard hides "Connect
// bank" while any is missing, instead of offering a button that can only fail.
const REQUIRED = [
  "DATABASE_URL",
  "TINK_CLIENT_ID",
  "TINK_CLIENT_SECRET",
  "TINK_REDIRECT_URI",
] as const;

// Same rule as app/api/tink/route.ts: only a database on this computer is
// reached without Supabase's certificate.
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** Names of the bank settings that are missing or unusable; empty when all are set. */
export function missingBankSettings(env: Record<string, string | undefined>): string[] {
  const missing: string[] = REQUIRED.filter((name) => !env[name]?.trim());
  // The route supports Demo Bank only and refuses to start outside test mode.
  if (env.TINK_TEST_MODE === "false") missing.push("TINK_TEST_MODE");
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) return missing;

  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    return [...missing, "DATABASE_URL"];
  }
  if (
    !LOCAL_HOSTS.includes(host) &&
    !env.DATABASE_CA_CERT?.includes("-----BEGIN CERTIFICATE-----")
  ) {
    missing.push("DATABASE_CA_CERT");
  }
  return missing;
}
