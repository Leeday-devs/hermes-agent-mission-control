import test from "node:test";
import assert from "node:assert/strict";
import { planDecision, isClaimableStatus, CLAIMABLE_STATUSES } from "./request-decision";

const claimable = { id: "r1", kind: "oneshot", status: "awaiting_approval", title: "t", prompt: "p" };

test("approve/reject plan an update without touching title/prompt", () => {
  const approved = planDecision(claimable, "approve", {});
  assert.deepEqual(approved, { ok: true, data: { status: "approved" } });

  const rejected = planDecision(claimable, "reject", {});
  assert.deepEqual(rejected, { ok: true, data: { status: "rejected" } });
});

test("an unknown action is rejected with 400 and no data to write", () => {
  const r = planDecision(claimable, "explode", {});
  assert.deepEqual(r, { ok: false, status: 400, error: "action must be approve|reject|edit" });
});

test("a request not in a claimable status is rejected with 409, regardless of action", () => {
  for (const status of ["approved", "rejected", "running", "done", "failed"]) {
    for (const action of ["approve", "reject", "edit"]) {
      const r = planDecision({ ...claimable, status }, action, { title: "t", prompt: "p" });
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.equal(r.status, 409);
        assert.match(r.error, new RegExp(status));
      }
    }
  }
});

test("edit validates and normalizes title/prompt for an editable kind", () => {
  const r = planDecision(claimable, "edit", { title: "  New title  ", prompt: "  new prompt  " });
  assert.deepEqual(r, { ok: true, data: { status: "approved", title: "New title", prompt: "new prompt" } });
});

test("edit surfaces request-edit validation errors and writes nothing", () => {
  const r = planDecision(claimable, "edit", { title: "", prompt: "p" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 400);
});

test("cron.* requests reject edit even with an otherwise-valid title/prompt — approve/reject still work", () => {
  const cronRequest = { id: "c1", kind: "cron.pause", status: "awaiting_approval", title: "Cron pause: abc123", prompt: "{}" };

  const edit = planDecision(cronRequest, "edit", { title: "New title", prompt: "new prompt" });
  assert.equal(edit.ok, false);
  if (!edit.ok) {
    assert.equal(edit.status, 400);
    assert.match(edit.error, /cannot be edited/);
  }

  assert.deepEqual(planDecision(cronRequest, "approve", {}), { ok: true, data: { status: "approved" } });
  assert.deepEqual(planDecision(cronRequest, "reject", {}), { ok: true, data: { status: "rejected" } });
});

test("isClaimableStatus / CLAIMABLE_STATUSES model the atomic DB claim guard", () => {
  assert.equal(isClaimableStatus("queued"), true);
  assert.equal(isClaimableStatus("awaiting_approval"), true);
  assert.equal(isClaimableStatus("approved"), false);
  assert.equal(isClaimableStatus("rejected"), false);
  assert.deepEqual([...CLAIMABLE_STATUSES].sort(), ["awaiting_approval", "queued"]);
});
