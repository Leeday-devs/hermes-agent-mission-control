export type CronJob = {
  id: string;
  status: string; // "active" | "paused"
  name: string;
  schedule: string;
  nextRun: string | null;
  lastRun: string | null;
  lastResult: string | null;
  deliver: string | null;
  skills: string | null;
  script: string | null;
  mode: string | null;
};

// Parse the raw `hermes cron list --all` terminal output into clean objects.
// Format per job: two-space-indented "<id> [status]" then four-space "Key: value" lines.
export function parseCrons(raw: string): CronJob[] {
  const jobs: CronJob[] = [];
  let cur: CronJob | null = null;
  const push = () => { if (cur) jobs.push(cur); };
  for (const line of raw.split("\n")) {
    const head = line.match(/^\s{2}([0-9a-f]{6,})\s+\[(\w+)\]/);
    if (head) {
      push();
      cur = { id: head[1], status: head[2], name: "", schedule: "", nextRun: null, lastRun: null, lastResult: null, deliver: null, skills: null, script: null, mode: null };
      continue;
    }
    const kv = line.match(/^\s{4}([A-Za-z][A-Za-z ]*?):\s+(.*)$/);
    if (kv && cur) {
      const key = kv[1].trim().toLowerCase();
      const val = kv[2].trim();
      if (key === "name") cur.name = val;
      else if (key === "schedule") cur.schedule = val;
      else if (key === "next run") cur.nextRun = val;
      else if (key === "deliver") cur.deliver = val;
      else if (key === "skills") cur.skills = val;
      else if (key === "script") cur.script = val;
      else if (key === "mode") cur.mode = val;
      else if (key === "last run") {
        const m = val.match(/^(\S+)\s+(.*)$/);
        cur.lastRun = m ? m[1] : val;
        cur.lastResult = m ? m[2] : null;
      }
    }
  }
  push();
  return jobs;
}

// Bounded, operation-specific validation for POST /api/hermes/crons bodies.
// This is the single source of truth for what a cron mutation request may
// contain — the route persists exactly `args` (nothing else from the raw
// body) as the JSON that hermes-bridge's buildRunArgs() later parses back
// out, so every field it reads (schedule/prompt/name/id) is validated here
// first.
export type CronOp = "create" | "pause" | "resume" | "run" | "remove" | "edit";

export type CronRequestArgs = {
  id?: string;
  name?: string;
  schedule?: string;
  prompt?: string;
};

export type ParsedCronRequest =
  | { ok: true; op: CronOp; label: string; args: CronRequestArgs }
  | { ok: false; error: string };

const CRON_OPS: readonly CronOp[] = ["create", "pause", "resume", "run", "remove", "edit"];

const MAX_LABEL_LEN = 200;
const MAX_PROMPT_LEN = 4000;
const MAX_NAME_LEN = 200;

// Matches a lowercase-hex cron id as emitted by `hermes cron list --all`
// (see the `head` regex in parseCrons above).
const CRON_ID = /^[0-9a-f]{6,64}$/;
// Free-form job names ("Backup", "Weekly digest") — letters/digits/spaces
// and a few punctuation marks, must start with an alnum, bounded length.
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,199}$/;
const CRON_SCHEDULE_PRESETS = new Set(["daily", "weekly", "monthly", "hourly", "weekdays", "weekends"]);
const CRON_FIELD = /^[0-9*/,-]+$/;

const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeText(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen || CONTROL_CHARS.test(trimmed)) return null;
  return trimmed;
}

function safeSchedule(value: unknown): string | null {
  const s = safeText(value, 100);
  if (!s) return null;
  if (CRON_SCHEDULE_PRESETS.has(s.toLowerCase())) return s.toLowerCase();
  const fields = s.split(/\s+/);
  if (fields.length !== 5 || !fields.every((f) => CRON_FIELD.test(f))) return null;
  return s;
}

export function parseCronRequestBody(body: unknown): ParsedCronRequest {
  if (!isPlainObject(body)) return { ok: false, error: "request body must be an object" };

  const rawOp = typeof body.op === "string" ? body.op : "";
  if (!CRON_OPS.includes(rawOp as CronOp)) {
    return { ok: false, error: `op must be one of: ${CRON_OPS.join(", ")}` };
  }
  const op = rawOp as CronOp;

  if (op === "create") {
    const schedule = safeSchedule(body.schedule);
    if (!schedule) return { ok: false, error: "schedule must be a 5-field cron expression or a known preset" };

    if (body.prompt !== undefined && typeof body.prompt !== "string") {
      return { ok: false, error: "prompt must be a string" };
    }
    if (body.name !== undefined && typeof body.name !== "string") {
      return { ok: false, error: "name must be a string" };
    }
    const prompt = body.prompt !== undefined ? safeText(body.prompt, MAX_PROMPT_LEN) : null;
    if (body.prompt !== undefined && prompt === null) {
      return { ok: false, error: `prompt must be a plain string up to ${MAX_PROMPT_LEN} characters, no control characters` };
    }
    const name = body.name !== undefined ? safeText(body.name, MAX_NAME_LEN) : null;
    if (body.name !== undefined && name === null) {
      return { ok: false, error: `name must be a plain string up to ${MAX_NAME_LEN} characters, no control characters` };
    }
    if (!prompt && !name) return { ok: false, error: "create requires a prompt or name" };

    const args: CronRequestArgs = { schedule };
    if (prompt) args.prompt = prompt;
    if (name) args.name = name;
    const label = `Schedule: ${schedule} — ${prompt || name}`.slice(0, MAX_LABEL_LEN);
    return { ok: true, op, label, args };
  }

  // pause | resume | run | remove | edit — target an existing job by id or name.
  if (body.id !== undefined) {
    const id = safeText(body.id, 64);
    if (!id || !CRON_ID.test(id)) {
      return { ok: false, error: "id must be a lowercase hex string, 6-64 characters" };
    }
    const label = `Cron ${op}: ${id}`.slice(0, MAX_LABEL_LEN);
    return { ok: true, op, label, args: { id } };
  }
  if (body.name !== undefined) {
    const name = safeText(body.name, MAX_NAME_LEN);
    if (!name || !SAFE_NAME.test(name)) {
      return { ok: false, error: `name must be a plain string up to ${MAX_NAME_LEN} characters, starting with a letter or digit` };
    }
    const label = `Cron ${op}: ${name}`.slice(0, MAX_LABEL_LEN);
    return { ok: true, op, label, args: { name } };
  }
  return { ok: false, error: `${op} requires an id or name` };
}
