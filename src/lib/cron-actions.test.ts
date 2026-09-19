import test from "node:test";
import assert from "node:assert/strict";
import { cronActionFor } from "./cron-actions";

test("cron action policy exposes only safe status-appropriate approval ops", () => {
  assert.deepEqual(cronActionFor({ id: "a1", name: "Backup", status: "active" }), [
    { op: "run", label: "Run now" },
    { op: "pause", label: "Pause" },
  ]);
  assert.deepEqual(cronActionFor({ id: "a2", name: "Digest", status: "paused" }), [
    { op: "run", label: "Run now" },
    { op: "resume", label: "Resume" },
  ]);
  assert.deepEqual(cronActionFor({ id: "a3", name: "Done", status: "completed" }), []);
  for (const status of ["unknown", "error", "disabled", "running", "malformed", "completed", "", " ACTIVE "]) {
    assert.deepEqual(cronActionFor({ id: "x", name: "Unsafe", status }), [], status);
  }
});
