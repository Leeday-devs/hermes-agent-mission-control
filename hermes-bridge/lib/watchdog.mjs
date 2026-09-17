import { redact, sourceHealth, watchdogTransition, SOURCE_IDS } from './operational.mjs';

// Notifications are opt-in configuration, never sent during verification.
export async function notifyTelegram(text, env = process.env, send = fetch) {
  if (!env.MC_TELEGRAM_BOT_TOKEN || !env.MC_TELEGRAM_CHAT_ID) return 'not-configured';
  try {
    const response = await send(`https://api.telegram.org/bot${env.MC_TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.MC_TELEGRAM_CHAT_ID, text: redact(text) }), signal: AbortSignal.timeout(10000),
    });
    const body = await response.json();
    return response.ok && body.ok === true ? 'sent' : 'failed';
  } catch { return 'failed'; }
}
export async function recordSync(id, operation, { get, put, emit }, now = () => new Date().toISOString()) {
  const previous = await get(`mc-source:${id}`) ?? {};
  try {
    const count = await operation();
    const evidence = { lastSuccess: now(), error: null, count: Number.isInteger(count) ? count : null };
    try { await put(`mc-source:${id}`, evidence); } catch (error) {
      try { await emit('watchdog', `${id}: persistence unavailable`, { detail: redact(`${id}: sync succeeded but evidence persistence failed: ${error?.message || 'unknown error'}`), level: 'warn', meta: { source: id, state: 'unavailable' } }); } catch {}
      return { ...evidence, error: `${id}: evidence persistence failed` };
    }
    // State changes get a timeline entry; successful heartbeats live in DataStore.
    if (!previous.lastSuccess || previous.error) await emit('sync', `${id}: sync succeeded`, { meta: { source: id, state: 'completed' } });
    return evidence;
  } catch (error) {
    const evidence = { ...previous, error: `${id}: sync failed; last successful evidence retained`, lastAttempt: now() };
    try { await put(`mc-source:${id}`, evidence); } catch (persistError) {
      try { await emit('watchdog', `${id}: sync unavailable`, { detail: redact(`${id}: ${error?.message || 'sync failed'}; persistence failed: ${persistError?.message || 'unknown error'}`), level: 'warn', meta: { source: id, state: 'unavailable' } }); } catch {}
    }
    return evidence;
  }
}
export async function runWatchdog({ get, claim, emit, notify = notifyTelegram }, now = Date.now()) {
  for (const id of SOURCE_IDS) {
    const health = sourceHealth(id, await get(`mc-source:${id}`) ?? {}, now);
    // claim must persist and atomically return the previous state or undefined if unchanged.
    const previous = await claim(id, health.state);
    if (previous === undefined) continue;
    const transition = watchdogTransition(previous, health);
    if (!transition.notify && !transition.recovered && !['stale', 'unavailable'].includes(health.state)) continue;
    await emit('watchdog', `${id}: ${health.state}`, { detail: health.reason, level: transition.recovered ? 'up' : 'warn', meta: { source: id, state: health.state } });
    if (transition.notify) {
      const result = await notify(`Mission Control: ${id} ${health.state}. ${health.reason}`);
      await emit('notification', `${id}: Telegram ${result}`, { level: result === 'failed' ? 'warn' : 'info', meta: { source: id, state: result === 'sent' ? 'completed' : 'blocked' } });
    }
  }
}
