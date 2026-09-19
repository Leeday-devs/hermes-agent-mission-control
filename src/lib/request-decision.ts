import { isEditableRequestKind } from "./hermes-approval";
import { validateEditedRequest } from "./request-edit";

export const CLAIMABLE_STATUSES = ["awaiting_approval", "queued"] as const;

export function isClaimableStatus(status: string): boolean {
  return (CLAIMABLE_STATUSES as readonly string[]).includes(status);
}

type RequestForDecision = {
  kind: string;
  status: string;
};

type DecisionData = {
  status: "approved" | "rejected";
  title?: string;
  prompt?: string;
};

export type DecisionPlan =
  | { ok: true; data: DecisionData }
  | { ok: false; status: 400 | 409; error: string };

export function planDecision(
  request: RequestForDecision,
  action: string,
  body: Record<string, unknown>,
): DecisionPlan {
  if (!isClaimableStatus(request.status)) {
    return { ok: false, status: 409, error: `cannot decide a ${request.status} request` };
  }
  if (action === "approve") return { ok: true, data: { status: "approved" } };
  if (action === "reject") return { ok: true, data: { status: "rejected" } };
  if (action !== "edit") return { ok: false, status: 400, error: "action must be approve|reject|edit" };
  if (!isEditableRequestKind(request.kind)) {
    return { ok: false, status: 400, error: "cron requests cannot be edited; approve or reject the original request" };
  }
  const edited = validateEditedRequest(body.title, body.prompt);
  if (!edited.ok) return { ok: false, status: 400, error: edited.error };
  return { ok: true, data: { status: "approved", title: edited.title, prompt: edited.prompt } };
}
