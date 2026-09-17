// Shared by the bridge and dashboard. No process-presence heuristics.
export const SOURCE_IDS = ['kanban', 'crons', 'wiki', 'drive', 'cost', 'bridge'];
export const RETENTION_DAYS = 30;
export const EVENT_LIMIT = 2000;
export function redact(value = '') {
  return String(value)
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[redacted private key]')
    .replace(/\b(?:sk-|ghp_|github_pat_|xox[baprs]-)[\w-]+/g, '[redacted]')
    .replace(/(Bearer\s+)\S+/gi, '$1[redacted]')
    .replace(/(:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[redacted]@')
    .replace(/(["']?[\w-]*(?:token|secret|password|credential|api[_-]?key|authorization|cookie|database_url)[\w-]*["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|\S+)/gi, '$1[redacted]')
    .slice(0, 8000);
}
export function sourceHealth(id, evidence = {}, now = Date.now()) {
  const stamp = Date.parse(evidence.lastSuccess || '');
  const valid = Number.isFinite(stamp) && stamp <= now;
  const ageMs = valid ? now - stamp : null;
  const stale = ageMs !== null && ageMs > 180000;
  const state = !valid ? 'unavailable' : evidence.error ? 'unavailable' : stale ? 'stale' : id === 'bridge' ? 'live' : 'mirrored';
  return { id, state, lastSuccess: valid ? new Date(stamp).toISOString() : null, ageMs,
    count: Number.isInteger(evidence.count) && evidence.count >= 0 ? evidence.count : null,
    reason: redact(evidence.error || (!valid ? 'No successful sync evidence' : stale ? 'Last successful sync is older than 3 minutes' : '')) };
}
export function watchdogTransition(previous, health) {
  const rank = { live: 0, mirrored: 0, stale: 1, unavailable: 2 };
  const before = rank[previous?.state] ?? 0;
  const after = rank[health.state] ?? 2;
  return { changed: previous?.state !== health.state, notify: after > before, recovered: before > 0 && after === 0 };
}
export function retainEvents(events, now = Date.now()) {
  return events.filter(e => Date.parse(e.createdAt) >= now - RETENTION_DAYS * 86400000 && Date.parse(e.createdAt) <= now)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, EVENT_LIMIT);
}
export function filterEvents(events, filters = {}) {
  return events.filter(e => (!filters.agent || e.agent === filters.agent) && (!filters.source || e.source === filters.source)
    && (!filters.severity || e.severity === filters.severity) && (!filters.task || e.task === filters.task)
    && (!filters.since || Date.parse(e.createdAt) > Date.parse(filters.since))
    && (!filters.until || Date.parse(e.createdAt) <= Date.parse(filters.until))
    && (!filters.search || `${e.title} ${e.detail} ${e.task}`.toLowerCase().includes(filters.search.toLowerCase())));
}
