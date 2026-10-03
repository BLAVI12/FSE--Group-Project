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

async function currentUser(token) {
  const r = await call("/auth/v1/user", { token });
  assert.equal(r.status, 200, `user lookup failed: ${JSON.stringify(r.body)}`);
  return r.body;
}

async function count(table, token) {
  const r = await call(`/rest/v1/${table}?select=id`, {
    token,
    headers: { prefer: "count=exact", range: "0-0" },
  });
  return { status: r.status, total: Number(r.headers.get("content-range")?.split("/")[1] ?? NaN) };
}

const demo = await login(DEMO);
const demoUser = await currentUser(demo);
const first = (await call("/rest/v1/transactions?select=id,amount,category,is_transfer&order=booked_date.desc,id&limit=1", { token: demo })).body[0];

await check("demo login works and sees exactly its own data (1 connection, 2 accounts, all transactions)", async () => {
  assert.equal((await count("connections", demo)).total, 1);
  assert.equal((await count("accounts", demo)).total, 2);
  assert.equal((await count("profiles", demo)).total, 1);
  assert.equal((await count("categories", demo)).total, 14);
  const t = await count("transactions", demo);
  assert.ok(t.total >= 3534, `transactions: ${t.total}`);
});

await check("demo can set the category of its own transaction", async () => {
  const categories = await call("/rest/v1/categories?select=id&name=eq.Utilities&user_id=is.null", { token: demo });
  assert.equal(categories.status, 200, JSON.stringify(categories.body));
  assert.equal(categories.body.length, 1);
  const r = await call("/rest/v1/rpc/set_transaction_category", {
    token: demo,
    method: "POST",
    body: { p_transaction_id: first.id, p_category_id: categories.body[0].id },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const updated = await call(`/rest/v1/transactions?id=eq.${first.id}&select=category`, { token: demo });
  assert.equal(updated.body[0].category, "Utilities");
  const assignments = await call(
    `/rest/v1/category_assignments?transaction_id=eq.${first.id}&is_active=eq.true&select=assignment_source`,
    { token: demo }
  );
  assert.equal(assignments.status, 200);
  assert.ok(assignments.body.some((assignment) => assignment.assignment_source === "manual"));
});

await check("demo cannot bypass category-assignment history with a direct update", async () => {
  const r = await call(`/rest/v1/transactions?id=eq.${first.id}`, {
    token: demo, method: "PATCH", body: { category: "Utilities" },
  });
  assert.ok(r.status >= 400, `status ${r.status}`);
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

await check("raw transaction payloads are not available through the browser API", async () => {
  const r = await call("/rest/v1/transactions?select=raw_payload&limit=1", { token: demo });
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
const otherUser = await currentUser(other);

await check("a new user sees no one else's data", async () => {
  assert.equal((await count("connections", other)).total, 0);
  assert.equal((await count("accounts", other)).total, 0);
  assert.equal((await count("transactions", other)).total, 0);
  assert.equal((await count("profiles", other)).total, 1);
  assert.equal((await count("import_batches", other)).total, 0);
  const hiddenProfile = await call(`/rest/v1/profiles?id=eq.${demoUser.id}&select=id`, { token: other });
  assert.equal(hiddenProfile.status, 200);
  assert.deepEqual(hiddenProfile.body, []);
});

await check("custom categories are isolated between users", async () => {
  const created = await call("/rest/v1/categories?select=id,name", {
    token: demo,
    method: "POST",
    body: { user_id: demoUser.id, name: `private-${Date.now()}` },
    headers: { prefer: "return=representation" },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const categoryId = created.body[0].id;
  try {
    const hidden = await call(`/rest/v1/categories?id=eq.${categoryId}&select=id`, { token: other });
    assert.equal(hidden.status, 200);
    assert.deepEqual(hidden.body, []);
  } finally {
    await call(`/rest/v1/categories?id=eq.${categoryId}`, { token: demo, method: "DELETE" });
  }
});

await check("a new user cannot categorise someone else's transaction", async () => {
  const categories = await call("/rest/v1/categories?select=id&name=eq.Utilities&user_id=is.null", { token: other });
  const r = await call("/rest/v1/rpc/set_transaction_category", {
    token: other,
    method: "POST",
    body: { p_transaction_id: first.id, p_category_id: categories.body[0].id },
  });
  assert.ok(r.status >= 400, `status ${r.status}`);
  const assignments = await call(
    `/rest/v1/category_assignments?transaction_id=eq.${first.id}&select=id`,
    { token: other }
  );
  assert.equal(assignments.status, 200);
  assert.deepEqual(assignments.body, []);
  const still = await call(`/rest/v1/transactions?id=eq.${first.id}&select=category`, { token: demo });
  assert.equal(still.body[0].category, "Utilities");
});

await check("without logging in, nothing is readable", async () => {
  for (const table of ["connections", "accounts", "transactions", "oauth_states", "profiles", "import_batches", "category_assignments"]) {
    const r = await call(`/rest/v1/${table}?select=id`);
    assert.ok(r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0), `${table}: status ${r.status}`);
  }
});

await check("the demo transaction's amount is unchanged", async () => {
  const r = await call(`/rest/v1/transactions?id=eq.${first.id}&select=amount,is_transfer`, { token: demo });
  assert.equal(r.body[0].amount, first.amount);
  assert.equal(r.body[0].is_transfer, first.is_transfer);
});

// Leave the demo row's legacy category value as it was.
const restoreCategory = first.category
  ? await call(`/rest/v1/categories?select=id&name=eq.${encodeURIComponent(first.category)}&user_id=is.null`, { token: demo })
  : { body: [] };
await call("/rest/v1/rpc/set_transaction_category", {
  token: demo,
  method: "POST",
  body: { p_transaction_id: first.id, p_category_id: restoreCategory.body[0]?.id ?? null },
});

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
