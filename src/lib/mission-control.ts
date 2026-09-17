import { prisma } from './prisma';
import { SOURCE_IDS, sourceHealth, redact, retainEvents, filterEvents, type Evidence, type LogEvent } from '../../hermes-bridge/lib/operational.mjs';
import { SPECIALISTS, type Room } from './specialists';

export async function readSources() {
  const rows = await prisma.dataStore.findMany({ where: { key: { in: SOURCE_IDS.map(id => `mc-source:${id}`) } } });
  return SOURCE_IDS.map(id => sourceHealth(id, (rows.find(r => r.key === `mc-source:${id}`)?.data ?? {}) as Evidence));
}
export async function missionSnapshot(filters: Record<string, string | undefined> = {}) {
  const [sources, requests, events, roomRows, cron] = await Promise.all([
    readSources(),
    prisma.agentRequest.findMany({ orderBy: { updatedAt: 'desc' }, take: 500 }),
    prisma.agentEvent.findMany({ where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } }, orderBy: { createdAt: 'desc' }, take: 2000 }),
    prisma.dataStore.findMany({ where: { key: { in: SPECIALISTS.map(p => `mc-room:${p.id}`) } } }),
    prisma.dataStore.findUnique({ where: { key: 'hermes-crons' } }),
  ]);
  const logs: LogEvent[] = events.map(e => {
    const meta = e.meta as {source?: string; state?: string; requestId?: string} | null;
    const safeEvent = ['watchdog', 'sync', 'room', 'notification'].includes(e.kind);
    return { id: e.id, createdAt: e.createdAt.toISOString(), kind: e.kind, title: safeEvent ? redact(e.title) : `Historical ${e.kind} event`,
      // Legacy activity can contain raw model output, prompts, or Drive content. Never copy it into this log.
      detail: safeEvent ? redact(e.detail ?? '') : 'Raw activity diagnostics and task prompts withheld; consult the approved evidence source.',
      agent: e.agent ?? 'unavailable', source: meta?.source ?? 'hermes', severity: e.level === 'down' ? 'error' : e.level === 'warn' ? 'warning' : 'info',
      state: meta?.state ?? 'unavailable', task: meta?.requestId ?? '', href: meta?.requestId ? `/mission-control#run-${encodeURIComponent(meta.requestId)}` : '/mission-control#system-log' };
  });
  const runs = requests.map(r => ({ id: r.id, kind: r.kind, title: `Historical ${r.kind} dispatch`, status: r.status,
    createdAt: r.createdAt.toISOString(), startedAt: r.startedAt?.toISOString() ?? null, finishedAt: r.finishedAt?.toISOString() ?? null,
    durationMs: r.startedAt && r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null,
    agent: 'Unavailable (legacy dispatch)', model: 'Unavailable', activity: 'Not recorded',
    evidence: `/hermes`, error: r.error ? 'Execution failed. Provider payload withheld.' : null,
  }));
  for (const r of requests) {
    for (const [kind, time, state] of [['dispatch', r.createdAt, 'started'], ['approval', r.decidedAt, r.status === 'rejected' ? 'blocked' : 'completed'], ['run', r.startedAt, 'running'], ['run', r.finishedAt, r.status === 'done' ? 'completed' : 'failed']] as const) {
      if (!time) continue;
      logs.push({ id: `${r.id}:${kind}:${state}`, createdAt: time.toISOString(), kind, title: `${kind}: historical ${r.kind} dispatch`, detail: 'Prompt and provider payload withheld.', agent: 'unavailable', source: r.kind.startsWith('cron.') ? 'crons' : 'dispatch', severity: state === 'failed' ? 'error' : 'info', state, task: r.id, href: `/mission-control#run-${r.id}` });
    }
  }
  const roomIssues = roomRows.flatMap(row => {
    const room = row.data as unknown as Room;
    const profile = row.key.slice('mc-room:'.length);
    const last = room.messages?.at(-1);
    return last && last.status !== 'completed' ? [{ id: last.id, title: `${profile}: room unavailable`, status: last.status, ageFrom: last.createdAt, owner: profile, detail: last.error ?? 'Execution pending', href: `/mission-control?room=${profile}#rooms`, urgency: 0 }] : [];
  });
  const inbox = [
    ...sources.filter(s => ['stale', 'unavailable'].includes(s.state)).map(s => ({ id: `source-${s.id}`, title: `${s.id} source`, status: s.state, ageFrom: s.lastSuccess, owner: 'ops-watch', detail: s.reason, href: `/mission-control#source-${s.id}`, urgency: s.state === 'unavailable' ? 0 : 1 })),
    ...requests.filter(r => ['failed', 'awaiting_approval', 'rejected'].includes(r.status)).map(r => ({ id: r.id, title: `Historical ${r.kind} dispatch`, status: r.status, ageFrom: r.updatedAt.toISOString(), owner: r.kind.startsWith('cron.') ? 'crons' : 'hermes', detail: r.status === 'awaiting_approval' ? 'Owner decision required' : 'See run evidence', href: `/mission-control#run-${r.id}`, urgency: r.status === 'failed' ? 0 : 2 })),
    ...roomIssues,
  ];
  // Cron mirror contains human-readable CLI output, not an authoritative run table.
  const cronData = cron?.data as {raw?: string; syncedAt?: string} | null;
  if (/last run:.*(?:failed|error)/i.test(cronData?.raw ?? '')) inbox.push({ id: 'recurring-failure', title: 'Recurring work reports a failed run', status: 'failed', ageFrom: cronData?.syncedAt ?? null, owner: 'crons', detail: 'Failure detected in the last mirrored cron listing; current state may be stale.', href: '/hermes', urgency: 0 });
  return { sources, runs, inbox: inbox.sort((a,b) => a.urgency - b.urgency || Date.parse(a.ageFrom ?? '') - Date.parse(b.ageFrom ?? '')), logs: filterEvents(retainEvents(logs), filters), observedAt: new Date().toISOString() };
}
