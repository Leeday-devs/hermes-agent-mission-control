import test from "node:test";
import assert from "node:assert/strict";
import { isCronSyncFresh } from "./cron-sync";

const NOW = Date.parse("2026-09-18T12:00:00.000Z");

test("cron sync freshness fails closed for missing and invalid timestamps", () => {
  assert.equal(isCronSyncFresh(null, NOW), false);
  assert.equal(isCronSyncFresh(undefined, NOW), false);
  assert.equal(isCronSyncFresh("not-a-date", NOW), false);
});

test("cron sync freshness rejects timestamps older than one hour", () => {
  assert.equal(isCronSyncFresh("2026-09-18T10:59:59.999Z", NOW), false);
});

test("cron sync freshness rejects future timestamps", () => {
  assert.equal(isCronSyncFresh("2026-09-18T12:00:00.001Z", NOW), false);
});

test("cron sync freshness accepts a current timestamp within one hour", () => {
  assert.equal(isCronSyncFresh("2026-09-18T11:30:00.000Z", NOW), true);
});
