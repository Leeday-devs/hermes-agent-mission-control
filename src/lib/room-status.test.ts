import test from "node:test";
import assert from "node:assert/strict";
import { roomStatusLabel } from "./room-status";

test("roomStatusLabel reports busy while sending", () => {
  assert.equal(roomStatusLabel(true, undefined, "Available: safe read-only specialist chat. Side effects require approval."), "Busy: a request is running.");
});

test("roomStatusLabel reports busy when the latest message is still running", () => {
  assert.equal(roomStatusLabel(false, "running", "Available: safe read-only specialist chat. Side effects require approval."), "Busy: a request is running.");
});

test("roomStatusLabel passes through the server availability truthfully when idle", () => {
  assert.equal(roomStatusLabel(false, "completed", "Unavailable: the current specialist execution failed."), "Unavailable: the current specialist execution failed.");
  assert.equal(roomStatusLabel(false, "failed", "Auth required: the current specialist execution has no provider credentials."), "Auth required: the current specialist execution has no provider credentials.");
});

test("roomStatusLabel falls back to unknown when no availability is loaded yet", () => {
  assert.equal(roomStatusLabel(false, undefined, null), "Unknown: availability not yet loaded.");
});
