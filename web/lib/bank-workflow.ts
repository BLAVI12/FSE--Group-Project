import "server-only";
import pg from "pg";
import { BankError, createBankWorkflow } from "@/lib/tink";
import { bankErrorCode } from "@/lib/bank-error";
import {
  createTinkClient,
  tinkConfigFromEnv,
} from "../../supabase/functions/_shared/tink/client.ts";

const database = globalThis as typeof globalThis & { tinkPool?: pg.Pool };

// Only the server routes in app/api/tink and app/api/cron read the database
// password and Tink secret, through this function.
export function bankWorkflow() {
  if (!process.env.DATABASE_URL) throw new BankError("NOT_CONFIGURED");
  if (!database.tinkPool) {
    const url = new URL(process.env.DATABASE_URL);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const ca = process.env.DATABASE_CA_CERT;
    if (!local && !ca) throw new BankError("MISSING_DATABASE_CA_CERT");
    url.searchParams.delete("sslmode");
    pg.types.setTypeParser(20, (value) => {
      const amount = Number(value);
      if (!Number.isSafeInteger(amount)) throw new BankError("UNSAFE_AMOUNT");
      return amount;
    });
    pg.types.setTypeParser(1082, (value) => value);
    database.tinkPool = new pg.Pool({
      connectionString: url.toString(),
      max: 2,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 10_000,
      ssl: local
        ? false
        : { rejectUnauthorized: true, ca },
    });
    database.tinkPool.on("error", (error) =>
      console.error("Bank database connection failed.", { code: bankErrorCode(error) }),
    );
  }
  // Keep external calls below the function budget so failures can still be recorded cleanly.
  const config = tinkConfigFromEnv((name) => process.env[name]);
  if (!config.testMode) throw new BankError("DEMO_MODE_REQUIRED");
  const tink = createTinkClient(config, {
    signal: AbortSignal.timeout(45_000),
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
  });
  return createBankWorkflow(database.tinkPool, tink);
}
