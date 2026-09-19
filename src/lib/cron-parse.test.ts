import test from "node:test";
import assert from "node:assert/strict";
import { parseCrons, parseCronRequestBody } from "./cron-parse";

const SAMPLE = [
  "  a1b2c3d4 [active]",
  "    Name: Backup",
  "    Schedule: 0 9 * * 1",
  "    Next run: 2026-09-20T09:00:00Z",
  "    Last run: 2026-09-13T09:00:00Z ok",
  "    Deliver: slack",
  "    Skills: read-only",
  "    Script: backup.sh",
  "    Mode: safe",
  "  f00dcafe [paused]",
  "    Name: Digest",
  "    Schedule: daily",
].join("\n");

test("parseCrons extracts jobs and their public + internal fields", () => {
  const jobs = parseCrons(SAMPLE);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].id, "a1b2c3d4");
  assert.equal(jobs[0].status, "active");
  assert.equal(jobs[0].name, "Backup");
  assert.equal(jobs[0].schedule, "0 9 * * 1");
  assert.equal(jobs[0].lastRun, "2026-09-13T09:00:00Z");
  assert.equal(jobs[0].lastResult, "ok");
  assert.equal(jobs[1].id, "f00dcafe");
  assert.equal(jobs[1].status, "paused");
  assert.equal(jobs[1].name, "Digest");
});

test("parseCrons returns an empty list for blank input", () => {
  assert.deepEqual(parseCrons(""), []);
});

test("parseCronRequestBody rejects a non-object body", () => {
  for (const bad of [null, undefined, "nope", 42, [], []]) {
    const r = parseCronRequestBody(bad);
    assert.equal(r.ok, false);
  }
});

test("parseCronRequestBody rejects an unknown op", () => {
  const r = parseCronRequestBody({ op: "delete-everything" });
  assert.equal(r.ok, false);
});

test("parseCronRequestBody: create requires a valid 5-field or preset schedule", () => {
  const ok = parseCronRequestBody({ op: "create", schedule: "0 9 * * 1", prompt: "Send the weekly digest" });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.op, "create");
    assert.deepEqual(ok.args, { schedule: "0 9 * * 1", prompt: "Send the weekly digest" });
    assert.equal(ok.label, "Schedule: 0 9 * * 1 — Send the weekly digest");
  }

  const preset = parseCronRequestBody({ op: "create", schedule: "daily", prompt: "Ping" });
  assert.equal(preset.ok, true);

  for (const bad of ["0 9 * *", "rm -rf /", "* * * * * *", "", "   "]) {
    const r = parseCronRequestBody({ op: "create", schedule: bad, prompt: "Ping" });
    assert.equal(r.ok, false, `expected schedule to be rejected: ${JSON.stringify(bad)}`);
  }
});

test("parseCronRequestBody: create requires a prompt or name, bounded and control-char free", () => {
  const missing = parseCronRequestBody({ op: "create", schedule: "daily" });
  assert.equal(missing.ok, false);

  const withName = parseCronRequestBody({ op: "create", schedule: "daily", name: "Digest" });
  assert.equal(withName.ok, true);

  const tooLong = parseCronRequestBody({ op: "create", schedule: "daily", prompt: "x".repeat(4001) });
  assert.equal(tooLong.ok, false);

  const controlChars = parseCronRequestBody({ op: "create", schedule: "daily", prompt: "hi\x00there" });
  assert.equal(controlChars.ok, false);

  const nonString = parseCronRequestBody({ op: "create", schedule: "daily", prompt: 123 });
  assert.equal(nonString.ok, false);
});

test("parseCronRequestBody: pause/resume/run/remove/edit require a safe id or name", () => {
  for (const op of ["pause", "resume", "run", "remove", "edit"]) {
    const byId = parseCronRequestBody({ op, id: "a1b2c3d4" });
    assert.equal(byId.ok, true, op);
    if (byId.ok) assert.deepEqual(byId.args, { id: "a1b2c3d4" });

    const byName = parseCronRequestBody({ op, name: "Backup" });
    assert.equal(byName.ok, true, op);
    if (byName.ok) assert.deepEqual(byName.args, { name: "Backup" });

    const neither = parseCronRequestBody({ op });
    assert.equal(neither.ok, false, op);

    const badId = parseCronRequestBody({ op, id: "not-hex!!" });
    assert.equal(badId.ok, false, op);

    const badName = parseCronRequestBody({ op, name: "../../etc/passwd" });
    assert.equal(badName.ok, false, op);
  }
});

test("parseCronRequestBody: id takes priority over name and is never mixed into the args", () => {
  const r = parseCronRequestBody({ op: "run", id: "a1b2c3d4", name: "Backup" });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.args, { id: "a1b2c3d4" });
});

test("parseCronRequestBody produces a title-length-bounded label", () => {
  const r = parseCronRequestBody({ op: "run", name: "x".repeat(199) });
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(r.label.length <= 200);
});
