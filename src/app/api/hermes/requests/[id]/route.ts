import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CLAIMABLE_STATUSES, planDecision } from "@/lib/request-decision";
import { isAuthorizedRequest } from "@/lib/route-auth";

const MAX_DECISION_BODY_BYTES = 8_192;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthorizedRequest(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_DECISION_BODY_BYTES) {
    return NextResponse.json({ error: "request body is too large" }, { status: 413 });
  }
  const parsed: unknown = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return NextResponse.json({ error: "request body must be an object" }, { status: 400 });
  const b = parsed as Record<string, unknown>;
  if (typeof b.action !== "string") return NextResponse.json({ error: "action must be approve|reject|edit" }, { status: 400 });

  const { id } = await params;
  const existing = await prisma.agentRequest.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const plan = planDecision(existing, b.action, b);
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });

  const data = { ...plan.data, decidedAt: new Date() };
  const claimed = await prisma.agentRequest.updateMany({
    where: { id, status: { in: [...CLAIMABLE_STATUSES] } },
    data,
  });
  if (claimed.count === 0) {
    const current = await prisma.agentRequest.findUnique({ where: { id }, select: { status: true } });
    if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ error: `cannot decide a ${current.status} request` }, { status: 409 });
  }
  const row = await prisma.agentRequest.findUnique({ where: { id } });
  return NextResponse.json({ request: row });
}
