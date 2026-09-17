import test from 'node:test';
import assert from 'node:assert/strict';
import { roomRateLimitRemaining, ROOM_RATE_LIMIT_MS } from '../app/api/mission-control/rooms/[profile]/route';

test('room rate limit is atomic-window based and reports remaining seconds', () => {
  const now = Date.parse('2026-09-17T12:00:10.000Z');
  assert.equal(roomRateLimitRemaining('2026-09-17T12:00:01.000Z', now), 1_000);
  assert.equal(roomRateLimitRemaining('2026-09-17T12:00:00.000Z', now), 0);
  assert.equal(roomRateLimitRemaining(null, now), 0);
  assert.equal(ROOM_RATE_LIMIT_MS, 10_000);
});
