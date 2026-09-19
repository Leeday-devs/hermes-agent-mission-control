export type EditedRequestValidation =
  | { ok: true; title: string; prompt: string }
  | { ok: false; error: string };

const MAX_TITLE_LEN = 200;
const MAX_PROMPT_LEN = 4000;

const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

// An owner editing a pending request's title/prompt gets exact bytes back
// out, or an error — never a silently truncated or coerced value they didn't
// type, which could otherwise approve something subtly different from what
// they reviewed.
export function validateEditedRequest(title: unknown, prompt: unknown): EditedRequestValidation {
  if (typeof title !== "string") return { ok: false, error: "title must be a string" };
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return { ok: false, error: "title is required" };
  if (CONTROL_CHARS.test(trimmedTitle)) return { ok: false, error: "title must not contain control characters" };
  if (trimmedTitle.length > MAX_TITLE_LEN) return { ok: false, error: `title must be ${MAX_TITLE_LEN} characters or fewer` };

  if (prompt !== undefined && prompt !== null && typeof prompt !== "string") {
    return { ok: false, error: "prompt must be a string" };
  }
  const trimmedPrompt = typeof prompt === "string" ? prompt.trim() : "";
  if (CONTROL_CHARS.test(trimmedPrompt)) return { ok: false, error: "prompt must not contain control characters" };
  if (trimmedPrompt.length > MAX_PROMPT_LEN) return { ok: false, error: `prompt must be ${MAX_PROMPT_LEN} characters or fewer` };

  return { ok: true, title: trimmedTitle, prompt: trimmedPrompt };
}
