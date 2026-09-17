import { test } from "node:test";
import assert from "node:assert/strict";
import { assertRunnable, buildRunArgs } from "./commands.mjs";

test("assertRunnable throws for a request still awaiting approval", () => {
  assert.throws(
    () => assertRunnable({ id: "r1", status: "awaiting_approval" }),
    /awaiting_approval/
  );
});

test("assertRunnable throws for unexpected statuses", () => {
  for (const status of ["done", "failed", "rejected", "running"]) {
    assert.throws(() => assertRunnable({ id: "r1", status }));
  }
});

test("assertRunnable allows queued and approved", () => {
  assert.doesNotThrow(() => assertRunnable({ id: "r1", status: "queued" }));
  assert.doesNotThrow(() => assertRunnable({ id: "r1", status: "approved" }));
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
