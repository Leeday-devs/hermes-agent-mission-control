import { test } from "node:test";
import assert from "node:assert/strict";
import { assertRunnable, buildRunArgs, claimTransition, recoverTransition } from "./commands.mjs";

test("assertRunnable throws for a request still awaiting approval", () => {
  assert.throws(
    () => assertRunnable({ id: "r1", status: "awaiting_approval" }),
    /awaiting_approval/
  );
});

test("assertRunnable throws for unexpected statuses", () => {
  for (const status of ["done", "failed", "rejected"]) {
    assert.throws(() => assertRunnable({ id: "r1", status }));
  }
});

test("assertRunnable allows queued, approved, and running (already claimed)", () => {
  assert.doesNotThrow(() => assertRunnable({ id: "r1", status: "queued" }));
  assert.doesNotThrow(() => assertRunnable({ id: "r1", status: "approved" }));
  assert.doesNotThrow(() => assertRunnable({ id: "r1", status: "running" }));
});

// Regression: bridge.mjs's claim step (queued/approved -> running) happens
// atomically in SQL (UPDATE ... WHERE status IN (...) RETURNING *). The row
// handed to runRequest() afterwards genuinely has status="running" — it must
// NOT be rejected by assertRunnable/buildRunArgs, or every claimed request
// would fail immediately after being claimed. claimTransition() models that
// same atomic SQL contract so the claim -> build-args pipeline is
// unit-testable without a live Postgres.
test("claim-to-execution: claiming a queued/approved request marks it running, and it can still be run", () => {
  for (const status of ["queued", "approved"]) {
    const claimed = claimTransition({ id: "r1", status, kind: "oneshot", title: "t", prompt: "hi" });
    assert.ok(claimed, `expected ${status} to be claimable`);
    assert.equal(claimed.status, "running");
    assert.doesNotThrow(() => assertRunnable(claimed));
    const plan = buildRunArgs(claimed, { board: "default" });
    assert.deepEqual(plan.argv, ["-z", "hi"]);
  }
});

test("claim-to-execution: only queued/approved rows can be claimed; everything else is refused", () => {
  for (const status of ["awaiting_approval", "running", "done", "failed", "rejected"]) {
    assert.equal(claimTransition({ id: "r1", status }), null, status);
  }
});

test("recoverTransition fails only a genuinely stale running request", () => {
  const now = Date.parse("2026-09-19T12:00:00.000Z");
  assert.equal(recoverTransition({ id: "r1", status: "running", startedAt: "2026-09-19T11:50:00.001Z" }, now), null);
  assert.deepEqual(recoverTransition({ id: "r1", status: "running", startedAt: "2026-09-19T11:49:59.999Z" }, now), { id: "r1", status: "failed", startedAt: "2026-09-19T11:49:59.999Z" });
  assert.equal(recoverTransition({ id: "r1", status: "queued", startedAt: "2026-09-19T11:00:00.000Z" }, now), null);
});

test("buildRunArgs refuses to build a command for an awaiting_approval row", () => {
  assert.throws(
    () => buildRunArgs({ id: "r1", status: "awaiting_approval", kind: "oneshot", title: "do it" }),
    /awaiting_approval/
  );
});

test("buildRunArgs: oneshot uses -z with the prompt, falling back to title", () => {
  const withPrompt = buildRunArgs({ status: "queued", kind: "oneshot", title: "t", prompt: "do the thing" });
  assert.deepEqual(withPrompt.argv, ["-z", "do the thing"]);

  const noPrompt = buildRunArgs({ status: "queued", kind: "oneshot", title: "fallback title", prompt: null });
  assert.deepEqual(noPrompt.argv, ["-z", "fallback title"]);
});

test("buildRunArgs: chat behaves like oneshot", () => {
  const r = buildRunArgs({ status: "approved", kind: "chat", title: "t", prompt: "hi" });
  assert.deepEqual(r.argv, ["-z", "hi"]);
});

test("buildRunArgs: room.chat uses the local profile and bounded room session", () => {
  const r = buildRunArgs({
    status: "queued",
    kind: "room.chat",
    title: "Orchestrator room message",
    prompt: JSON.stringify({ profile: "orchestrator", prompt: "Reply with exactly OK.", messageId: "550e8400-e29b-41d4-a716-446655440000" }),
  });
  assert.deepEqual(r.argv, [
    "-p", "orchestrator", "chat", "--toolsets", "hermes-webhook", "--continue",
    "mission-control-orchestrator", "--create-if-missing", "--query", "Reply with exactly OK.",
    "--oneshot", "--quiet", "--run-budget", "120",
  ]);
});

test("buildRunArgs: kanban puts --board before the subcommand", () => {
  const r = buildRunArgs({ status: "queued", kind: "kanban", title: "Ship the thing" }, { board: "default" });
  assert.deepEqual(r.argv, ["kanban", "--board", "default", "create", "--json", "Ship the thing"]);
});

test("buildRunArgs: cron.create builds schedule + prompt", () => {
  const r = buildRunArgs({
    status: "approved",
    kind: "cron.create",
    title: "t",
    prompt: JSON.stringify({ schedule: "0 9 * * 1", prompt: "send the weekly report" }),
  });
  assert.deepEqual(r.argv, ["cron", "create", "0 9 * * 1", "send the weekly report"]);
});

test("buildRunArgs: cron.pause/resume/run/remove/edit target id or name", () => {
  const base = { status: "approved", kind: "", title: "t" };
  const withId = (op, extra) => ({ ...base, kind: `cron.${op}`, prompt: JSON.stringify(extra) });

  assert.deepEqual(buildRunArgs(withId("pause", { id: "abc123" })).argv, ["cron", "pause", "abc123"]);
  assert.deepEqual(buildRunArgs(withId("resume", { name: "weekly-report" })).argv, ["cron", "resume", "weekly-report"]);
  assert.deepEqual(buildRunArgs(withId("run", { id: "abc123" })).argv, ["cron", "run", "abc123"]);
  assert.deepEqual(buildRunArgs(withId("remove", { id: "abc123" })).argv, ["cron", "remove", "abc123"]);
  assert.deepEqual(buildRunArgs(withId("edit", { id: "abc123" })).argv, ["cron", "edit", "abc123"]);
});

test("buildRunArgs: unknown cron op throws", () => {
  assert.throws(
    () => buildRunArgs({ status: "approved", kind: "cron.nope", title: "t", prompt: "{}" }),
    /unknown cron op/
  );
});

test("buildRunArgs: memory.write and briefing.generate are handled locally, not via CLI", () => {
  assert.deepEqual(
    buildRunArgs({ status: "queued", kind: "memory.write", title: "t" }),
    { local: "memory.write" }
  );
  assert.deepEqual(
    buildRunArgs({ status: "queued", kind: "briefing.generate", title: "t" }),
    { local: "briefing.generate" }
  );
});

test("buildRunArgs: unknown kind throws", () => {
  assert.throws(
    () => buildRunArgs({ status: "queued", kind: "mystery", title: "t" }),
    /unknown kind/
  );
});
