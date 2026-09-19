import test from "node:test";
import assert from "node:assert/strict";
import { safeCronResponse } from "./cron-response";

test("safeCronResponse exposes only the public cron fields", () => {
  const shaped = safeCronResponse({
    id: "abc123",
    status: "active",
    name: "Backup",
    schedule: "daily",
    nextRun: null,
    lastRun: null,
    lastResult: null,
    deliver: null,
    skills: "secret-skill",
    script: "rm -rf /",
    mode: "dangerous",
    prompt: "secret prompt",
    secret: "secret value",
    workdir: "/secret",
  } as never);

  assert.deepEqual(Object.keys(shaped).sort(), [
    "deliver", "id", "lastResult", "lastRun", "name", "nextRun", "schedule", "status",
  ]);
  assert.equal("script" in shaped, false);
  assert.equal("skills" in shaped, false);
  assert.equal("mode" in shaped, false);
  assert.equal("prompt" in shaped, false);
  assert.equal("secret" in shaped, false);
  assert.equal("workdir" in shaped, false);
});
