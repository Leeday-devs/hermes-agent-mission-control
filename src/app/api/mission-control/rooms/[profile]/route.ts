import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { specialist, validateMessage, configuredModel, roomAvailability, type Room, type RoomMessage } from '@/lib/specialists';
import { redact } from '../../../../../../hermes-bridge/lib/operational.mjs';
import { spawnSpecialist } from '@/lib/room-runner';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ profile: string }> };
function safeMessage(message: RoomMessage) {
  return { id: message.id, label: 'Owner message sent' as const, status: message.status, createdAt: message.createdAt,
    startedAt: message.startedAt, finishedAt: message.finishedAt, model: message.model,
    result: message.result ? redact(message.result) : null, error: message.error ? redact(message.error) : null };
}
export async function GET(_req: Request, ctx: Context) {
  const { profile } = await ctx.params;
  if (!specialist(profile)) return Response.json({ error: 'Unknown profile' }, { status: 404 });
  try {
    const row = await prisma.dataStore.findUnique({ where: { key: `mc-room:${profile}` } });
    const room = (row?.data as Room | undefined) ?? { messages: [], lastSentAt: null };
    const safeRoom = { ...room, messages: room.messages.map(safeMessage) };
    const availability = roomAvailability(room);
    return Response.json({ room: safeRoom, availability }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Room history unavailable: database could not be read.' }, { status: 503 }); }
}
export const ROOM_RATE_LIMIT_MS = 10_000;
export function roomRateLimitRemaining(lastSentAt: string | null, nowMs: number = Date.now()) {
  if (!lastSentAt) return 0;
  const elapsed = nowMs - Date.parse(lastSentAt);
  return Number.isFinite(elapsed) && elapsed < ROOM_RATE_LIMIT_MS ? ROOM_RATE_LIMIT_MS - elapsed : 0;
}

async function boundedBody(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error('Message required');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 20000) { await reader.cancel(); throw new Error('Request too large'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}
export async function POST(req: Request, ctx: Context) {
  const { profile } = await ctx.params;
  if (!specialist(profile)) return Response.json({ error: 'Unknown profile' }, { status: 404 });
  if (req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Same-origin request required' }, { status: 403 });
  let prompt: string;
  try { const body = await boundedBody(req); prompt = validateMessage(profile, body.prompt); }
  catch { return Response.json({ error: 'A valid JSON message of 1–4000 characters is required (20 KB request limit).' }, { status: 400 }); }
  // Do not persist or execute secrets, including prompts that would be altered by redaction.
  if (redact(prompt) !== prompt) return Response.json({ error: 'Remove credentials from the message before sending.' }, { status: 400 });
  try {
    const outcome = await prisma.$transaction(async tx => {
      // Transaction-scoped PostgreSQL lock protects all server processes, not just this worker.
      const locks = await tx.$queryRaw<{locked: boolean}[]>`SELECT pg_try_advisory_xact_lock(hashtext(${`mc-room:${profile}`})) AS locked`;
      if (!locks[0]?.locked) return { kind: 'busy' as const };
      const row = await tx.dataStore.findUnique({ where: { key: `mc-room:${profile}` } });
      const room = (row?.data as unknown as Room) ?? { messages: [], lastSentAt: null };
      const staleAt = Date.now() - 10 * 60 * 1000;
      const recovered = room.messages.map(message => message.status === 'running' && Date.parse(message.startedAt ?? message.createdAt) < staleAt
        ? { ...message, status: 'failed', error: 'Recovered stale running room task.', finishedAt: new Date().toISOString() } : message);
      if (recovered.some(message => message.status === 'running')) return { kind: 'busy' as const };
      const remaining = roomRateLimitRemaining(room.lastSentAt, Date.now());
      if (remaining > 0) return { kind: 'rate-limited' as const, retryAfter: Math.ceil(remaining / 1000) };
      const now = new Date().toISOString();
      const message: RoomMessage = { id: randomUUID(), label: 'Owner message sent', status: 'running', error: null, result: null, createdAt: now, startedAt: now, finishedAt: null, model: configuredModel(profile) };
      const data = { messages: [...recovered, message].slice(-200), lastSentAt: now };
      await tx.dataStore.upsert({ where: { key: `mc-room:${profile}` }, create: { key: `mc-room:${profile}`, data }, update: { data } });
      return { kind: 'claimed' as const, data };
    });
    if (outcome.kind === 'busy') return Response.json({ error: 'Room busy: another message is already running.' }, { status: 429, headers: { 'Retry-After': '1' } });
    if (outcome.kind === 'rate-limited') return Response.json({ error: 'Rate limited: wait before sending another room message.' }, { status: 429, headers: { 'Retry-After': String(outcome.retryAfter) } });
    const message = outcome.data.messages.at(-1)!;
    try {
      const execution = await spawnSpecialist(profile, prompt);
      message.status = 'completed'; message.result = execution.result; message.finishedAt = new Date().toISOString();
    } catch (error) {
      message.status = 'failed'; message.error = redact(error instanceof Error ? error.message : 'Hermes execution failed'); message.finishedAt = new Date().toISOString();
    }
    let updated: Room | null = null;
    try {
      updated = await prisma.$transaction(async tx => {
        // Re-acquire the same transaction lock and re-read after Hermes finishes: any
        // concurrent writer is serialized before this replacement, so its messages and
        // lastSentAt are preserved rather than overwritten by the initial snapshot.
        const locks = await tx.$queryRaw<{locked: boolean}[]>`SELECT pg_try_advisory_xact_lock(hashtext(${`mc-room:${profile}`})) AS locked`;
        if (!locks[0]?.locked) throw new Error('room lock unavailable');
        const row = await tx.dataStore.findUnique({ where: { key: `mc-room:${profile}` } });
        const current = (row?.data as Room | undefined) ?? { messages: [], lastSentAt: null };
        if (!current.messages.some(item => item.id === message.id)) throw new Error('room message no longer exists');
        const data: Room = { ...current, messages: current.messages.map(item => item.id === message.id ? message : item) };
        await tx.dataStore.update({ where: { key: `mc-room:${profile}` }, data: { data } });
        return data;
      });
    }
    catch { await prisma.agentEvent.create({ data: { kind: 'room', title: `${profile}: failed`, detail: 'Final room state could not be persisted; task outcome withheld.', agent: profile, level: 'down', meta: { source: 'rooms', state: 'failed', requestId: message.id } } }); return Response.json({ error: 'Room result could not be persisted.' }, { status: 503 }); }
    await prisma.agentEvent.create({ data: { kind: 'room', title: `${profile}: ${message.status}`, detail: redact(message.error || 'Specialist result persisted.'), agent: profile, level: message.status === 'completed' ? 'info' : 'warn', meta: { source: 'rooms', state: message.status, requestId: message.id } } });
    await prisma.$executeRaw`DELETE FROM "AgentEvent" WHERE id IN (SELECT id FROM "AgentEvent" ORDER BY "createdAt" DESC OFFSET 2000) OR "createdAt" < NOW() - INTERVAL '30 days'`;
    return Response.json({ room: { ...updated, messages: updated.messages.map(safeMessage) }, availability: roomAvailability(updated) }, { status: 201 });
  } catch { return Response.json({ error: 'Message could not be persisted or executed.' }, { status: 503 }); }
}
