import assert from "node:assert/strict";
import test from "node:test";
import { BankRequestError, pollBankStatus, requestBank } from "../lib/bank-request.ts";

const stalledFetch: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
  const keepAlive = setTimeout(() => reject(new Error("request did not time out")), 2000);
  const abort = () => { clearTimeout(keepAlive); reject(init?.signal?.reason); };
  if (init?.signal?.aborted) abort();
  else init?.signal?.addEventListener("abort", abort, { once: true });
});

test("a hanging browser bank request times out so the controls can recover", async () => {
  await assert.rejects(requestBank("action=sync", "POST", undefined, stalledFetch, 30), {
    name: "TimeoutError",
  });
});

test("leaving the dashboard cancels its pending bank request", async () => {
  const controller = new AbortController();
  const pending = requestBank("action=status", "GET", controller.signal, stalledFetch);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("bank requests bypass caches and accept queued sync responses", async () => {
  const fake: typeof fetch = async (input, init) => {
    assert.equal(input, "/api/tink?action=sync&manual=true");
    assert.equal(init?.method, "POST");
    assert.equal(init?.cache, "no-store");
    return Response.json({ status: "syncing" }, { status: 202 });
  };
  assert.deepEqual(await requestBank("action=sync&manual=true", "POST", undefined, fake), { status: "syncing" });
});

test("a timed-out status check is retried until the background import finishes", async () => {
  let calls = 0;
  const states: string[] = [];
  const fake: typeof fetch = async (input, init) => {
    assert.equal(input, "/api/tink?action=status");
    assert.equal(init?.method, "GET");
    assert.equal(init?.cache, "no-store");
    calls++;
    if (calls === 1) return stalledFetch(input, init);
    return Response.json({
      connected: true, state: calls === 2 ? "syncing" : "synced",
      lastSynced: "2026-10-08T13:00:00Z",
      ...(calls === 3 ? { transactionFingerprint: "saved-transactions" } : {}),
    });
  };
  const result = await pollBankStatus(undefined, {
    fetch: fake, requestTimeoutMs: 30, intervalMs: 1, timeoutMs: 1000,
    onStatus: (status) => states.push(status.state),
  });
  assert.equal(result.state, "synced");
  assert.equal(result.lastSynced, "2026-10-08T13:00:00Z");
  assert.equal(result.transactionFingerprint, "saved-transactions");
  assert.equal(calls, 3);
  assert.deepEqual(states, ["syncing", "synced"]);
});

test("temporary status failures recover but a recorded import error remains visible", async () => {
  let calls = 0;
  const fake: typeof fetch = async () => ++calls === 1
    ? new Response(null, { status: 503 })
    : Response.json({ connected: true, state: "error" });
  assert.equal((await pollBankStatus(undefined, { fetch: fake, intervalMs: 1, timeoutMs: 1000 })).state, "error");
  assert.equal(calls, 2);
});

test("status polling stops immediately when the login is no longer valid", async () => {
  let calls = 0;
  await assert.rejects(pollBankStatus(undefined, {
    fetch: async () => { calls++; return new Response(null, { status: 401 }); },
    intervalMs: 1, timeoutMs: 1000,
  }), (error) => error instanceof BankRequestError && error.status === 401);
  assert.equal(calls, 1);
});

test("status polling remains bounded even when every request stalls", async () => {
  await assert.rejects(pollBankStatus(undefined, {
    fetch: stalledFetch, requestTimeoutMs: 10, intervalMs: 1, timeoutMs: 40,
  }), { name: "TimeoutError" });
});

test("leaving the page cancels polling without another status request", async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = pollBankStatus(controller.signal, {
    fetch: async () => { calls++; controller.abort(); return Response.json({ connected: true, state: "syncing" }); },
    intervalMs: 1, timeoutMs: 1000,
  });
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(calls, 1);
});
