import test from "node:test";
import assert from "node:assert/strict";
import { validateEditedRequest } from "./request-edit";

test("validateEditedRequest rejects an empty title", () => {
  assert.deepEqual(validateEditedRequest("   ", "keep prompt"), { ok: false, error: "title is required" });
});

test("validateEditedRequest trims and caps a valid title", () => {
  const result = validateEditedRequest("  Ship this  ", "prompt");
  assert.deepEqual(result, { ok: true, title: "Ship this", prompt: "prompt" });
});

test("validateEditedRequest rejects a non-string title instead of coercing it", () => {
  for (const bad of [42, null, undefined, {}, []]) {
    assert.equal(validateEditedRequest(bad, "prompt").ok, false);
  }
});

test("validateEditedRequest rejects a title over 200 characters rather than truncating it", () => {
  const longTitle = "a".repeat(201);
  const result = validateEditedRequest(longTitle, "prompt");
  assert.deepEqual(result, { ok: false, error: "title must be 200 characters or fewer" });
});

test("validateEditedRequest accepts a title at exactly the 200 character boundary", () => {
  const title = "a".repeat(200);
  const result = validateEditedRequest(title, "prompt");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.title.length, 200);
});

test("validateEditedRequest rejects control characters in the title", () => {
  const result = validateEditedRequest("hi\x00there", "prompt");
  assert.equal(result.ok, false);
});

test("validateEditedRequest treats a missing prompt as an empty string", () => {
  const result = validateEditedRequest("title", undefined);
  assert.deepEqual(result, { ok: true, title: "title", prompt: "" });
});

test("validateEditedRequest rejects a non-string prompt instead of silently discarding it", () => {
  for (const bad of [42, {}, []]) {
    assert.equal(validateEditedRequest("title", bad).ok, false);
  }
});

test("validateEditedRequest rejects a prompt over 4000 characters rather than truncating it", () => {
  const longPrompt = "a".repeat(4001);
  const result = validateEditedRequest("title", longPrompt);
  assert.deepEqual(result, { ok: false, error: "prompt must be 4000 characters or fewer" });
});

test("validateEditedRequest accepts a prompt at exactly the 4000 character boundary", () => {
  const prompt = "a".repeat(4000);
  const result = validateEditedRequest("title", prompt);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.prompt.length, 4000);
});

test("validateEditedRequest rejects control characters in the prompt", () => {
  const result = validateEditedRequest("title", "hi\x1bthere");
  assert.equal(result.ok, false);
});

test("validateEditedRequest trims prompt whitespace consistently with title", () => {
  const result = validateEditedRequest("title", "  do the thing  ");
  assert.deepEqual(result, { ok: true, title: "title", prompt: "do the thing" });
});
