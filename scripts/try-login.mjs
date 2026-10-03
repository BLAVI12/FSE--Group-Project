// Manual check of login + data access against a Supabase project, using the
// same auth service and client the frontend will use.
//
//   node --env-file=.env.local scripts/try-login.mjs
//
// .env.local needs SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY. Logs in as the
// demo user unless LOGIN_EMAIL / LOGIN_PASSWORD are set. Changes nothing.
import { createAuthService } from "../src/features/auth/auth-service.js";
import { createSupabaseBrowserClient } from "../src/lib/supabase/client.js";

const email = process.env.LOGIN_EMAIL ?? "demo@example.com";
const password = process.env.LOGIN_PASSWORD ?? "demo-planner-2026";

const euros = (cents) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

const supabase = createSupabaseBrowserClient({
  url: process.env.SUPABASE_URL,
  publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
});
const auth = createAuthService(supabase, { appOrigin: "http://localhost" });

// 1. Not logged in: nothing may be readable.
const anonymous = await supabase.from("transactions").select("id").limit(1);
console.log(
  anonymous.error
    ? `1. Not logged in: refused (${anonymous.error.message})`
    : `1. Not logged in: ${anonymous.data.length} rows ${anonymous.data.length ? "<- PROBLEM" : "(ok)"}`
);

// 2. Log in.
const { user } = await auth.signIn({ email, password });
console.log(`2. Logged in as ${user.email} (${user.id})`);

// 3. Own data.
const accounts = await supabase.from("accounts").select("name, iban, balance_booked").order("name");
if (accounts.error) throw accounts.error;
const count = await supabase.from("transactions").select("id", { count: "exact", head: true });
if (count.error) throw count.error;
console.log(`3. ${accounts.data.length} accounts, ${count.count} transactions`);
for (const a of accounts.data) console.log(`     ${a.name.padEnd(10)} ${a.iban}  ${euros(a.balance_booked)}`);

const newest = await supabase
  .from("transactions")
  .select("booked_date, description, amount, status, is_transfer")
  .order("booked_date", { ascending: false })
  .limit(5);
if (newest.error) throw newest.error;
console.log("   Newest transactions:");
for (const t of newest.data) {
  console.log(`     ${t.booked_date}  ${t.description.padEnd(15)} ${euros(t.amount).padStart(12)}  ${t.status}`);
}

// 4. Changing an amount must be refused (category is the only editable field).
const tamper = await supabase.from("transactions").update({ amount: 1 }).eq("description", "Salary");
console.log(
  tamper.error
    ? `4. Changing an amount: refused (${tamper.error.message})`
    : "4. Changing an amount: ALLOWED <- PROBLEM"
);

await auth.signOut();
console.log("5. Logged out");
