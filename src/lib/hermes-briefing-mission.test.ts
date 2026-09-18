import test from "node:test";
import assert from "node:assert/strict";
import { buildBriefingMission } from "./hermes-briefing-mission";

test("builds a oneshot mission preserving exact item and section context", () => {
  assert.deepEqual(buildBriefingMission("Needs attention", "Send the exact note"), {
    kind: "oneshot",
    title: "Send the exact note",
    prompt: 'From the Chief-of-Staff briefing section "Needs attention": Send the exact note\n\nInvestigate this item and execute the appropriate work. Clarify only genuinely necessary choices before proceeding.',
  });
});
