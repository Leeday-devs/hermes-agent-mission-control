export type EditedRequestValidation =
  | { ok: true; title: string; prompt: string }
  | { ok: false; error: string };

export function validateEditedRequest(title: unknown, prompt: unknown): EditedRequestValidation {
  if (typeof title !== "string") return { ok: false, error: "title is required" };
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return { ok: false, error: "title is required" };
  return {
    ok: true,
    title: trimmedTitle.slice(0, 200),
    prompt: typeof prompt === "string" ? prompt : "",
  };
}
