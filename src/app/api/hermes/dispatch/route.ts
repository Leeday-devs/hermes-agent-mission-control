import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyApproval } from "@/lib/hermes-approval";

// POST { kind?, title, prompt?, sideEffecting? } → queue work for Hermes.
// Side-effecting work waits for approval; safe work is queued immediately.
// The `sideEffecting` flag from the caller can only escalate to approval —
// classifyApproval() also catches side-effecting prompts the caller didn't flag.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const title = (b.title || b.prompt || "").toString().trim();
  if (!title) return NextResponse.json({ error: "title or prompt required" }, { status: 400 });
  const kind = (b.kind || "oneshot").toString();
  const prompt = (b.prompt ?? b.title ?? "").toString() || null;
  const { sideEffecting, status } = classifyApproval({
    kind,
    title,
    prompt,
    requestedSideEffecting: Boolean(b.sideEffecting),
  });
  const row = await prisma.agentRequest.create({
    data: {
      origin: "web",
      kind,
      title: title.slice(0, 200),
      prompt,
      sideEffecting,
      status,
    },
  });
  return NextResponse.json({ request: row });
}
