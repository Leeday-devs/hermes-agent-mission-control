import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateEditedRequest } from "@/lib/request-edit";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await req.json().catch(() => null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return NextResponse.json({ error: "request body must be an object" }, { status: 400 });
  const b = parsed as Record<string, unknown>;
  const action = (b.action || "").toString(); // approve | reject | edit
  const existing = await prisma.agentRequest.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!["awaiting_approval", "queued"].includes(existing.status))
    return NextResponse.json({ error: `cannot decide a ${existing.status} request` }, { status: 409 });

  const data: Record<string, unknown> = { decidedAt: new Date() };
  if (action === "approve") data.status = "approved";
  else if (action === "reject") data.status = "rejected";
  else if (action === "edit") {
    const edited = validateEditedRequest(b.title, b.prompt);
    if (!edited.ok) return NextResponse.json({ error: edited.error }, { status: 400 });
    data.status = "approved";
    data.title = edited.title;
    data.prompt = edited.prompt;
  }
  else return NextResponse.json({ error: "action must be approve|reject|edit" }, { status: 400 });

  const row = await prisma.agentRequest.update({ where: { id }, data });
  return NextResponse.json({ request: row });
}
