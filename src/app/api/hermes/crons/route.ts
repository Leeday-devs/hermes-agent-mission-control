import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyApproval } from "@/lib/hermes-approval";
import { parseCronRequestBody, parseCrons } from "@/lib/cron-parse";
import { safeCronResponse } from "@/lib/cron-response";
import { isAuthorizedRequest } from "@/lib/route-auth";

const MAX_CRON_BODY_BYTES = 8_192;

export type CronJob = {
  id: string;
  status: string;           // "active" | "paused"
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

export async function GET() {
  const row = await prisma.dataStore.findUnique({ where: { key: "hermes-crons" } });
  const data = (row?.data as { raw?: string; syncedAt?: string } | null) ?? {};
  const jobs = data.raw ? parseCrons(data.raw).map(safeCronResponse) : [];
  return NextResponse.json({ jobs, syncedAt: data.syncedAt ?? null });
}

// POST { op: "create"|"pause"|"resume"|"run"|"remove"|"edit", ... } → queue a cron mutation for the bridge
export async function POST(req: Request) {
  if (!(await isAuthorizedRequest(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_CRON_BODY_BYTES) {
    return NextResponse.json({ error: "request body is too large" }, { status: 413 });
  }
  const body: unknown = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  const parsed = parseCronRequestBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const kind = `cron.${parsed.op}`;
  const { sideEffecting, status } = classifyApproval({ kind, title: parsed.label });
  const row = await prisma.agentRequest.create({
    data: {
      origin: "web",
      kind,
      title: parsed.label,
      prompt: JSON.stringify(parsed.args),
      sideEffecting,
      status,
    },
  });
  return NextResponse.json({ request: row });
}
