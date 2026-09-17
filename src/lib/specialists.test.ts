import test from 'node:test';
import assert from 'node:assert/strict';
import { roomAvailability, ROOM_AUTH_REQUIRED, ROOM_AVAILABLE, ROOM_UNAVAILABLE, ROOM_UNKNOWN, type Room } from './specialists';

const message = (status: string, error: string | null = null) => ({
  id: status, label: 'Owner message sent' as const, status, error, result: null,
  createdAt: new Date().toISOString(), startedAt: null, finishedAt: null, model: 'test',
});

test('room availability is based only on the latest outcome', () => {
  const room = (messages: ReturnType<typeof message>[]): Room => ({ messages, lastSentAt: null });
  assert.equal(roomAvailability(room([])), ROOM_UNKNOWN);
  assert.equal(roomAvailability(room([message('completed'), message('failed', 'Hermes failed')])), ROOM_UNAVAILABLE);
  assert.equal(roomAvailability(room([message('failed', 'Auth required: No Codex credentials stored')])), ROOM_AUTH_REQUIRED);
  assert.equal(roomAvailability(room([message('failed'), message('running')])), ROOM_AVAILABLE);
});
