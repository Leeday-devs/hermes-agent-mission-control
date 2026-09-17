export const SOURCE_IDS: string[];
export const RETENTION_DAYS: number;
export const EVENT_LIMIT: number;
export function redact(value?: unknown): string;
export interface Evidence { lastSuccess?: string | null; error?: string | null; count?: number | null }
export interface SourceHealth { id: string; state: string; lastSuccess: string | null; ageMs: number | null; count: number | null; reason: string }
export function sourceHealth(id: string, evidence?: Evidence, now?: number): SourceHealth;
export function watchdogTransition(previous: {state: string} | null, health: {state: string}): {changed: boolean; notify: boolean; recovered: boolean};
export interface LogEvent { id: string; createdAt: string; agent: string; source: string; severity: string; task: string; title: string; detail: string; state: string; kind: string; href: string }
export interface LogFilters { agent?: string; source?: string; severity?: string; task?: string; since?: string; until?: string; search?: string }
export function retainEvents<T extends {createdAt: string}>(events: T[], now?: number): T[];
export function filterEvents<T extends LogEvent>(events: T[], filters?: LogFilters): T[];
