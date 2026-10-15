// One-off maintenance for the demo login (October 2026). At Tink, the demo user
// has a broken Demo Commerzbank login, whose expiry marks the whole connection
// expired every day, and an empty Demo Bank password login. This removes those
// two and keeps the working Tink Demo Bank login. It reads only, unless --apply
// is given. Run from the repository root, with the bank settings in
// web/.env.local:
//
//   node scripts/clean-demo-bank-logins.mjs           # show what would be removed
//   node scripts/clean-demo-bank-logins.mjs --apply   # remove those logins
//
// Prints providers, statuses, account counts and dates only: never tokens,
// keys or bank data. Afterwards run
// supabase/maintenance/2026-10-16-demo-login-cleanup.sql in the SQL Editor.
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PROVIDERS_TO_REMOVE = ["de-demo-commerzbank-ob", "de-demobank-password"];
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@example.com";
const apply = process.argv.includes("--apply");

const repo = path.resolve(import.meta.dirname, "..");
const web = path.join(repo, "web");
const require = createRequire(path.join(web, "package.json"));
require("@next/env").loadEnvConfig(web, true, { info() {}, error: console.error });
const pg = require("pg");
const shared = (file) =>
  import(pathToFileURL(path.join(repo, "supabase/functions/_shared/tink", file)).href);
const { createTinkClient, tinkConfigFromEnv } = await shared("client.ts");
const { loginsToRemoveByProvider } = await shared("consents.ts");

function show(logins) {
  for (const login of logins) {
    const expiry = login.sessionExpiryDate
      ? new Date(Number(login.sessionExpiryDate)).toISOString().slice(0, 10)
      : "never";
    console.log(
      `  ${String(login.credentialsId).slice(0, 6)}…  ${login.providerName ?? "?"}  ` +
        `status ${login.status ?? "?"}  accounts ${login.accountIds?.length ?? 0}  expires ${expiry}`
    );
  }
}

const url = new URL(process.env.DATABASE_URL);
url.searchParams.delete("sslmode");
const pool = new pg.Pool({
  connectionString: url.toString(),
  max: 1,
  ssl: { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT },
});

try {
  const connection = (
    await pool.query(
      `select c.tink_external_user_id from public.connections c
         join auth.users u on u.id = c.user_id
        where u.email = $1 and c.provider = 'tink'`,
      [DEMO_EMAIL]
    )
  ).rows[0];
  if (!connection) throw new Error(`${DEMO_EMAIL} has no Tink connection`);

  const tink = createTinkClient(tinkConfigFromEnv((name) => process.env[name]));
  const before = await tink.bankLogins(connection.tink_external_user_id);
  console.log(`Bank logins of ${DEMO_EMAIL} at Tink:`);
  show(before);

  const ids = loginsToRemoveByProvider(before, PROVIDERS_TO_REMOVE);
  if (ids === null) {
    console.error("Refusing: no healthy login with accounts would remain. Nothing was removed.");
    process.exitCode = 1;
  } else if (ids.length === 0) {
    console.log("Nothing to remove.");
  } else if (!apply) {
    console.log(`Would remove ${ids.length} login(s). Run again with --apply to remove them.`);
  } else {
    await tink.removeBankLogins(connection.tink_external_user_id, ids);
    console.log(`Removed ${ids.length} login(s). Bank logins now:`);
    show(await tink.bankLogins(connection.tink_external_user_id));
    console.log("Next: supabase/maintenance/2026-10-16-demo-login-cleanup.sql in the SQL Editor.");
  }
} finally {
  await pool.end();
}
