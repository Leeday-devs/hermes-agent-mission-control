import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyApproval, isEditableRequestKind } from "./hermes-approval";

test("safe oneshot prompts are queued without approval", () => {
  const r = classifyApproval({ kind: "oneshot", title: "Summarize the last 5 client updates" });
  assert.equal(r.sideEffecting, false);
  assert.equal(r.status, "queued");
});

test("oneshot prompts with a side-effecting verb require approval", () => {
  for (const title of [
    "Send the invoice to the client",
    "Email the proposal to acme corp",
    "Post this update to the client Slack",
    "Delete the staging database",
    "Deploy the new landing page",
    "Buy 10 more API credits",
  ]) {
    const r = classifyApproval({ kind: "oneshot", title });
    assert.equal(r.sideEffecting, true, `expected side-effecting: ${title}`);
    assert.equal(r.status, "awaiting_approval");
  }
});

test("a caller cannot downgrade a side-effecting prompt by passing sideEffecting: false", () => {
  const r = classifyApproval({ kind: "oneshot", title: "Send the invoice", requestedSideEffecting: false });
  assert.equal(r.sideEffecting, true);
  assert.equal(r.status, "awaiting_approval");
});

test("backup requests require approval even when phrased without a command verb", () => {
  const r = classifyApproval({
    kind: "oneshot",
    title: "Back yourself up privately to GitHub every day at 6am and confirm it in the daily brief",
  });
  assert.equal(r.sideEffecting, true);
  assert.equal(r.status, "awaiting_approval");
});

test("a caller can escalate a safe-looking prompt by passing sideEffecting: true", () => {
  const r = classifyApproval({ kind: "oneshot", title: "Do the thing we discussed", requestedSideEffecting: true });
  assert.equal(r.sideEffecting, true);
  assert.equal(r.status, "awaiting_approval");
});

test("chat kind is classified the same as oneshot", () => {
  const r = classifyApproval({ kind: "chat", title: "hello", prompt: "please delete my old drafts" });
  assert.equal(r.sideEffecting, true);
});

test("room.chat prompts use the same approval boundary as chat", () => {
  const safe = classifyApproval({ kind: "room.chat", title: "Orchestrator room message", prompt: "Summarize the current status" });
  assert.equal(safe.status, "queued");
  const unsafe = classifyApproval({ kind: "room.chat", title: "Orchestrator room message", prompt: "Deploy this change" });
  assert.equal(unsafe.status, "awaiting_approval");
});

test("kanban card creation is safe by default", () => {
  const r = classifyApproval({ kind: "kanban", title: "Follow up with client re: hosting renewal" });
  assert.equal(r.sideEffecting, false);
  assert.equal(r.status, "queued");
});

test("memory.write and briefing.generate are safe by default", () => {
  assert.equal(classifyApproval({ kind: "memory.write", title: "t" }).sideEffecting, false);
  assert.equal(classifyApproval({ kind: "briefing.generate", title: "t" }).sideEffecting, false);
});

test("every cron.* op requires approval, including pause/resume/run", () => {
  for (const op of ["create", "edit", "remove", "pause", "resume", "run"]) {
    const r = classifyApproval({ kind: `cron.${op}`, title: `Cron ${op}` });
    assert.equal(r.sideEffecting, true, `cron.${op} should require approval`);
    assert.equal(r.status, "awaiting_approval");
  }
});

test("unknown kinds fail closed and require approval", () => {
  const r = classifyApproval({ kind: "something-new", title: "t" });
  assert.equal(r.sideEffecting, true);
  assert.equal(r.status, "awaiting_approval");
});

test("cron.* requests are immutable at approval — only oneshot/chat/kanban kinds may be edited", () => {
  for (const op of ["create", "edit", "remove", "pause", "resume", "run"]) {
    assert.equal(isEditableRequestKind(`cron.${op}`), false, `cron.${op} should not be editable`);
  }
  for (const kind of ["oneshot", "chat", "kanban", "memory.write", "briefing.generate"]) {
    assert.equal(isEditableRequestKind(kind), true, `${kind} should be editable`);
  }
});

test("account creation and sign-up requests require approval", () => {
  for (const title of [
    "Account creation for Obsidian",
    "Sign-up for the developer plan",
    "Create an account for Obsidian",
    "Create a account for the service",
    "Sign up for the developer plan",
    "Register for an account",
  ]) {
    const r = classifyApproval({ kind: "oneshot", title });
    assert.equal(r.sideEffecting, true, `expected side-effecting: ${title}`);
    assert.equal(r.status, "awaiting_approval");
  }
});
