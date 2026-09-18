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
