// Classifies AgentRequest work as safe-to-run or side-effecting-needs-approval.
//
// The caller-supplied `sideEffecting` flag can only ESCALATE a request to
// approval, never downgrade one that this classifier judges side-effecting.
// Unknown request kinds fail closed (require approval) rather than assuming
// they're safe.

export type RequestStatus = "queued" | "awaiting_approval";

export interface ApprovalInput {
  kind: string;
  title: string;
  prompt?: string | null;
  requestedSideEffecting?: boolean;
}

export interface ApprovalResult {
  sideEffecting: boolean;
  status: RequestStatus;
  reason: string;
}

const KNOWN_INTERNAL_KINDS = new Set(["kanban", "memory.write", "briefing.generate"]);
const KNOWN_PROMPT_KINDS = new Set(["oneshot", "chat", "room.chat"]);

// Verbs/phrases that reach outside the system: messaging, publishing, money,
// scheduling/booking, remote backups, or destructive operations.
const SIDE_EFFECT_KEYWORDS =
  /\b(send|e-?mail|dm|direct message|post|tweet|publish|deploy|release|delete|remove|destroy|drop\s+table|rm\s+-rf|cancel|refund|charge|pay|purchase|buy|order|invoice|withdraw|transfer|deposit|unsubscribe|schedule|book|create\s+(?:an?\s+)?account|account\s+creation|sign[-\s]+up|register(?:\s+for)?|registration|sign|merge|push|backup|back\s+up|github)\b/i;

export function classifyApproval(input: ApprovalInput): ApprovalResult {
  const kind = (input.kind || "").trim();
  const requested = Boolean(input.requestedSideEffecting);

  if (kind.startsWith("cron.")) {
    const op = kind.slice("cron.".length) || "?";
    return {
      sideEffecting: true,
      status: "awaiting_approval",
      reason: `cron.${op} changes a live schedule`,
    };
  }

  if (KNOWN_INTERNAL_KINDS.has(kind)) {
    if (requested) {
      return { sideEffecting: true, status: "awaiting_approval", reason: "caller flagged side-effecting" };
    }
    return { sideEffecting: false, status: "queued", reason: `${kind} has no external side effects` };
  }

  if (KNOWN_PROMPT_KINDS.has(kind)) {
    const text = `${input.title || ""} ${input.prompt || ""}`;
    const keywordHit = SIDE_EFFECT_KEYWORDS.test(text);
    const sideEffecting = requested || keywordHit;
    return {
      sideEffecting,
      status: sideEffecting ? "awaiting_approval" : "queued",
      reason: sideEffecting
        ? keywordHit
          ? "prompt matches a side-effecting action"
          : "caller flagged side-effecting"
        : "no side-effecting signal detected",
    };
  }

  // Unknown kind — fail closed rather than trust an unrecognized shape.
  return { sideEffecting: true, status: "awaiting_approval", reason: `unknown request kind "${kind}" — defaulting to approval` };
}

// cron.* requests carry the exact argv hermes-bridge will run (see
// cron-parse.ts / buildRunArgs()). Letting an approver rewrite the title or
// prompt of a cron request would let them approve one schedule/action while
// silently substituting another, so cron requests may only be approved or
// rejected as submitted — never edited.
export function isEditableRequestKind(kind: string): boolean {
  return !kind.trim().startsWith("cron.");
}
