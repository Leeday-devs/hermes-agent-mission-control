const MAX_CRON_SYNC_AGE_MS = 60 * 60 * 1000;

export function isCronSyncFresh(
  syncedAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (typeof syncedAt !== "string") return false;

  const syncedAtMs = Date.parse(syncedAt);
  if (!Number.isFinite(syncedAtMs)) return false;

  const ageMs = now - syncedAtMs;
  return ageMs >= 0 && ageMs <= MAX_CRON_SYNC_AGE_MS;
}
