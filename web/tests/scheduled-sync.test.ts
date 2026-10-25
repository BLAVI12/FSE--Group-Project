import assert from "node:assert/strict";
import test from "node:test";
import {
  scheduledSyncAuthorized,
  scheduledSyncConfigured,
  syncSlotStart,
} from "../lib/scheduled-sync.ts";

test("the day has four six-hour sync slots in UTC", () => {
  const at = (time: string) => syncSlotStart(new Date(`2026-10-23T${time}Z`)).toISOString();
  assert.equal(at("00:00:00"), "2026-10-23T00:00:00.000Z");
  assert.equal(at("05:59:59.999"), "2026-10-23T00:00:00.000Z");
  assert.equal(at("06:00:00"), "2026-10-23T06:00:00.000Z");
  assert.equal(at("15:17:00"), "2026-10-23T12:00:00.000Z");
  assert.equal(at("23:59:59"), "2026-10-23T18:00:00.000Z");
  const slots = new Set(Array.from({ length: 24 }, (_, hour) =>
    at(`${String(hour).padStart(2, "0")}:30:00`)));
  assert.equal(slots.size, 4);
});

test("finding the slot leaves the given time unchanged", () => {
  const time = new Date("2026-10-23T15:17:00Z");
  syncSlotStart(time);
  assert.equal(time.toISOString(), "2026-10-23T15:17:00.000Z");
});

test("scheduled sync runs only with a secret of at least 32 characters", () => {
  assert.equal(scheduledSyncConfigured(undefined), false);
  assert.equal(scheduledSyncConfigured(""), false);
  assert.equal(scheduledSyncConfigured("x".repeat(31)), false);
  assert.equal(scheduledSyncConfigured("x".repeat(32)), true);
});

test("only the exact bearer secret is accepted", () => {
  const secret = "s".repeat(40);
  assert.equal(scheduledSyncAuthorized(`Bearer ${secret}`, secret), true);
  assert.equal(scheduledSyncAuthorized(null, secret), false);
  assert.equal(scheduledSyncAuthorized(secret, secret), false);
  assert.equal(scheduledSyncAuthorized(`bearer ${secret}`, secret), false);
  assert.equal(scheduledSyncAuthorized(`Bearer ${secret}x`, secret), false);
  assert.equal(scheduledSyncAuthorized(`Bearer ${secret.slice(1)}`, secret), false);
  assert.equal(scheduledSyncAuthorized("Bearer ", secret), false);
});
