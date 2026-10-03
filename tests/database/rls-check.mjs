// "Users can only access their own data", checked through Supabase's real
// Auth and Data API, the way the frontend uses them: logs in as the demo user
// and as a brand-new user and tries everything a browser could do.
//
// Run against a local Supabase (`supabase start`, then `supabase db reset`),
// never against the hosted project: it signs up a throwaway user.
//   node tests/database/rls-check.mjs <API_URL> <PUBLISHABLE_KEY>
// Both values are printed by `supabase status`.
import assert from "node:assert/strict";

const [api, key] = process.argv.slice(2);
const DEMO = { email: "demo@example.com", password: "demo-planner-2026" };
const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push(`PASS  ${name}`);
  } catch (error) {
    results.push(`FAIL  ${name}\n      ${error.message.split("\n")[0]}`);
  }
}

async function call(path, { token, method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      apikey: key,
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

async function login({ email, password }) {
  const r = await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  assert.equal(r.status, 200, `login failed: ${JSON.stringify(r.body)}`);
  return r.body.access_token;
}

async function count(table, token) {
  const r = await call(`/rest/v1/${table}?select=id`, {
    token,
    headers: { prefer: "count=exact", range: "0-0" },
  });
  return { status: r.status, total: Number(r.headers.get("content-range")?.split("/")[1] ?? NaN) };
}

const demo = await login(DEMO);
const first = (await call("/rest/v1/transactions?select=id,amount,category,is_transfer&order=booked_date.desc,id&limit=1", { token: demo })).body[0];

await check("demo login works and sees exactly its own data (1 connection, 2 accounts, all transactions)", async () => {
  assert.equal((await count("connections", demo)).total, 1);
  assert.equal((await count("accounts", demo)).total, 2);
  const t = await count("transactions", demo);
  assert.ok(t.total >= 3534, `transactions: ${t.total}`);
});

await check("demo can set the category of its own transaction", async () => {
  const r = await call(`/rest/v1/transactions?id=eq.${first.id}`, {
    token: demo, method: "PATCH", body: { category: "Utilities" }, headers: { prefer: "return=representation" },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body[0].category, "Utilities");
});

await check("demo cannot change an amount", async () => {
  const r = await call(`/rest/v1/transactions?id=eq.${first.id}`, { token: demo, method: "PATCH", body: { amount: 1 } });
  assert.notEqual(r.status, 200);
  assert.notEqual(r.status, 204);
});

await check("demo cannot change the transfer flag", async () => {
  const r = await call(`/rest/v1/transactions?id=eq.${first.id}`, { token: demo, method: "PATCH", body: { is_transfer: true } });
  assert.ok(r.status >= 400, `status ${r.status}`);
});

await check("demo cannot insert or delete transactions", async () => {
  const ins = await call("/rest/v1/transactions", {
    token: demo, method: "POST",
    body: { account_id: first.id, provider_transaction_id: "x", amount: 100000, description: "fake", booked_date: "2026-10-01", status: "BOOKED" },
  });
  assert.ok(ins.status >= 400, `insert status ${ins.status}`);
  const del = await call(`/rest/v1/transactions?id=eq.${first.id}`, { token: demo, method: "DELETE" });
  assert.ok(del.status >= 400, `delete status ${del.status}`);
});

await check("demo cannot change accounts or connections", async () => {
  const acc = await call("/rest/v1/accounts?select=id&limit=1", { token: demo });
  const r = await call(`/rest/v1/accounts?id=eq.${acc.body[0].id}`, { token: demo, method: "PATCH", body: { balance_booked: 99999999 } });
  assert.ok(r.status >= 400, `status ${r.status}`);
});

await check("demo cannot read oauth_states", async () => {
  const r = await call("/rest/v1/oauth_states?select=state", { token: demo });
  assert.ok(r.status >= 400, `status ${r.status}`);
});

await check("an overlong category is rejected", async () => {
  const r = await call(`/rest/v1/transactions?id=eq.${first.id}`, { token: demo, method: "PATCH", body: { category: "x".repeat(51) } });
  assert.ok(r.status >= 400, `status ${r.status}`);
});

// A second, brand-new user.
const otherEmail = `other-${Date.now()}@example.com`;
const signup = await call("/auth/v1/signup", { method: "POST", body: { email: otherEmail, password: "other-password-1" } });
const other = signup.body?.access_token ?? (await login({ email: otherEmail, password: "other-password-1" }));

await check("a new user sees no one else's data", async () => {
  assert.equal((await count("connections", other)).total, 0);
  assert.equal((await count("accounts", other)).total, 0);
  assert.equal((await count("transactions", other)).total, 0);
});

await check("a new user cannot categorise someone else's transaction", async () => {
  const r = await call(`/rest/v1/transactions?id=eq.${first.id}`, {
    token: other, method: "PATCH", body: { category: "Hacked" }, headers: { prefer: "return=representation" },
  });
  assert.ok(r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0), `status ${r.status}`);
  const still = await call(`/rest/v1/transactions?id=eq.${first.id}&select=category`, { token: demo });
  assert.equal(still.body[0].category, "Utilities");
});

await check("without logging in, nothing is readable", async () => {
  for (const table of ["connections", "accounts", "transactions", "oauth_states"]) {
    const r = await call(`/rest/v1/${table}?select=id`);
    assert.ok(r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0), `${table}: status ${r.status}`);
  }
});

await check("the demo transaction's amount is unchanged", async () => {
  const r = await call(`/rest/v1/transactions?id=eq.${first.id}&select=amount,is_transfer`, { token: demo });
  assert.equal(r.body[0].amount, first.amount);
  assert.equal(r.body[0].is_transfer, first.is_transfer);
});

// Leave the demo row as it was.
await call(`/rest/v1/transactions?id=eq.${first.id}`, { token: demo, method: "PATCH", body: { category: first.category } });

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
