// Builds the `hermes` CLI invocation for an AgentRequest row, and guards
// against ever running one that's still waiting on human approval.
//
// Kept separate from bridge.mjs (which owns polling/DB/process-exec) so the
// argv shapes are unit-testable without a live Postgres or hermes binary.
//
// CLI shapes below target Hermes Agent CLI v0.21.3. `kanban`/`cron` keep the
// v0.17.x argument order (--board before the subcommand) — that ordering is
// unchanged through 0.21.3. If your build's flags differ, this is the only
// place that needs to change.
export const HERMES_CLI_VERSION = "0.21.3";

// Statuses a request may be claimed *from* (queued/approved), and the
// statuses it's legitimate for buildRunArgs() to see. "running" is included
// here because the claim step (see claimTransition() below, mirrored by the
// atomic `UPDATE ... WHERE status IN (...) RETURNING *` in bridge.mjs)
// transitions queued/approved -> running *before* handing the row to
// buildRunArgs — that's the row's genuine state at execution time, not a
// bypass of approval.
const CLAIMABLE_STATUSES = new Set(["queued", "approved"]);
const RUNNABLE_STATUSES = new Set(["queued", "approved", "running"]);

// Defense in depth: processQueue() in bridge.mjs already claims atomically
// via SQL, but every call path into buildRunArgs() re-checks here so a
// request awaiting approval can never be executed.
export function assertRunnable(request) {
  if (!request || typeof request.status !== "string") {
    throw new Error("refusing to run request: missing status");
  }
  if (request.status === "awaiting_approval") {
    throw new Error(`refusing to run request ${request.id}: still awaiting_approval`);
  }
  if (!RUNNABLE_STATUSES.has(request.status)) {
    throw new Error(`refusing to run request ${request.id}: unexpected status "${request.status}"`);
  }
}

// Models the atomic DB claim transition bridge.mjs performs with
// `UPDATE "AgentRequest" SET status='running', ... WHERE id=$1 AND status
// IN ('queued','approved') RETURNING *`. Only queued/approved rows may
// become running; everything else (including an already-running or
// awaiting_approval row) refuses the claim. Kept here, alongside
// assertRunnable/buildRunArgs, so the claim -> execution pipeline is
// unit-testable without a live Postgres.
export function claimTransition(row) {
  if (!row || !CLAIMABLE_STATUSES.has(row.status)) return null;
  return { ...row, status: "running", startedAt: new Date().toISOString() };
}

// Returns { argv } for a `hermes` CLI invocation, or { local: kind } for
// requests bridge.mjs handles itself (no CLI call). Throws for unknown
// kinds/ops so a bad request fails loudly instead of running something
// unintended.
export function buildRunArgs(request, { board } = {}) {
  assertRunnable(request);
  const kind = request.kind;

  if (kind === "oneshot" || kind === "chat") {
    return { argv: ["-z", request.prompt || request.title] };
  }

  if (kind === "kanban") {
    return { argv: ["kanban", "--board", board, "create", "--json", request.title] };
  }

  if (typeof kind === "string" && kind.startsWith("cron.")) {
    const op = kind.split(".")[1];
    const a = JSON.parse(request.prompt || "{}");
    const argv =
      op === "create" ? ["cron", "create", a.schedule, a.prompt || a.name].filter(Boolean)
      : op === "run"    ? ["cron", "run", a.id || a.name]
      : op === "pause"  ? ["cron", "pause", a.id || a.name]
      : op === "resume" ? ["cron", "resume", a.id || a.name]
      : op === "remove" ? ["cron", "remove", a.id || a.name]
      : op === "edit"   ? ["cron", "edit", a.id || a.name]
      : null;
    if (!argv) throw new Error(`unknown cron op ${op}`);
    return { argv };
  }

  if (kind === "memory.write") return { local: "memory.write" };
  if (kind === "briefing.generate") return { local: "briefing.generate" };

  throw new Error(`unknown kind ${kind}`);
}
