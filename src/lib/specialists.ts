export const SPECIALISTS = [
  { id: 'orchestrator', name: 'Orchestrator', role: 'Mission routing, decomposition, handoffs and approval gates', model: 'luna' },
  { id: 'km-agent', name: 'KM Agent', role: 'Durable knowledge, RAZSOC, graph health and drift audits', model: 'luna' },
  { id: 'builder', name: 'Builder', role: 'Scoped implementation, tests and integration fixes', model: 'terra' },
  { id: 'reviewer', name: 'Reviewer', role: 'Independent security, logic, regression and quality review', model: 'terra' },
  { id: 'qa', name: 'QA', role: 'Browser, workflow and CLI verification with evidence', model: 'terra' },
  { id: 'researcher', name: 'Researcher', role: 'Sourced research, synthesis and source verification', model: 'luna' },
  { id: 'ops-watch', name: 'Ops Watch', role: 'Gateway, recurring work, services and operational health', model: 'luna' },
  { id: 'maintainer', name: 'Maintainer', role: 'Upstream tracking, dependency maintenance and patch hygiene', model: 'luna' },
  { id: 'strategist', name: 'Strategist', role: 'Options, operating plans, constraints and kill criteria', model: 'terra' },
  { id: 'inbox-triage', name: 'Inbox Triage', role: 'Capture, discard, task, research and defer routing', model: 'luna' },
] as const;
export function specialist(id: unknown) { return SPECIALISTS.find(p => p.id === id); }
export function validateMessage(profile: unknown, prompt: unknown) {
  if (!specialist(profile)) throw new Error('Unknown specialist profile');
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(prompt)) throw new Error('Message must contain 1–4000 characters without control characters');
  return prompt.trim();
}
export function configuredModel(id: string) { const p = specialist(id); return p ? `openai-codex/gpt-5.6-${p.model}` : 'Unavailable'; }
export const ROOM_AUTH_REQUIRED = 'Auth required: the current specialist execution has no provider credentials.';
export const ROOM_AVAILABLE = 'Available: safe read-only specialist chat. Side effects require approval.';
export const ROOM_UNAVAILABLE = 'Unavailable: the current specialist execution failed.';
export const ROOM_UNKNOWN = 'Unknown: no current specialist execution outcome is recorded.';
export type RoomMessage = { id: string; label: 'Owner message sent'; status: string; error: string | null; result: string | null; createdAt: string; startedAt: string | null; finishedAt: string | null; model: string };
export type Room = { messages: RoomMessage[]; lastSentAt: string | null };
export function roomAvailability(room: Room) {
  const latest = room.messages.at(-1);
  if (!latest) return ROOM_UNKNOWN;
  if (latest.status === 'failed' && /auth required|no codex credentials|credentials stored/i.test(latest.error ?? '')) return ROOM_AUTH_REQUIRED;
  if (latest.status === 'failed') return ROOM_UNAVAILABLE;
  if (latest.status === 'running' || latest.status === 'completed') return ROOM_AVAILABLE;
  return ROOM_UNKNOWN;
}
