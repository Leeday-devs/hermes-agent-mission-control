import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildNetworkGraph, computeNetworkHealth, type RawDriveRow } from "@/lib/network-graph";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// The Drive mirror lives in Postgres (DataStore key "hermes-drive"), written
// by the local hermes-bridge — which is the only thing that ever holds the
// Google OAuth token/client files. The website's own Google sign-in client
// cannot receive a Drive refresh token, so this route must never call the
// Drive API, and never read credentials/env for Drive. Only the safe fields
// hermes-bridge already shaped (id/name/mimeType/modifiedTime/parentId/
// webViewLink) ever reach here.
type DriveMirror =
  | { available: true; rows: RawDriveRow[] }
  | { available: false; reason: string };

function readDriveMirror(data: unknown): DriveMirror {
  if (data && typeof data === "object" && "available" in data) {
    const record = data as { available: unknown; rows?: unknown; reason?: unknown };
    if (record.available === true && Array.isArray(record.rows)) {
      return { available: true, rows: record.rows as RawDriveRow[] };
    }
    if (record.available === false) {
      return { available: false, reason: typeof record.reason === "string" ? record.reason : "Google Drive is unavailable." };
    }
  }
  return { available: false, reason: "Google Drive has not synced yet." };
}

// Deliberately narrow selects: never fetch AgentEvent.meta, AgentRequest
// prompt/result/error, or anything OAuth/env related. These fields must
// never reach the network graph or the client.
export async function GET() {
  const [memory, tasks, ideas, clients, events, requests, driveRow] = await Promise.all([
    prisma.hermesMemory.findMany({
      select: { id: true, title: true, type: true, status: true, links: true, provenance: true, updatedAt: true },
    }),
    prisma.hermesTask.findMany({
      select: { id: true, title: true, assignee: true, status: true, board: true, updatedAt: true },
    }),
    prisma.idea.findMany({
      select: { id: true, title: true, status: true, category: true, timestamp: true },
    }),
    prisma.clientProject.findMany({
      select: { id: true, clientName: true, projectName: true, status: true, updatedAt: true },
    }),
    prisma.agentEvent.findMany({
      select: { id: true, title: true, agent: true, level: true, createdAt: true },
    }),
    prisma.agentRequest.findMany({
      select: { id: true, title: true, status: true, origin: true, hermesTaskId: true, createdAt: true },
    }),
    // The mirror row can be absent (bridge hasn't synced yet) or stale from
    // a prior outage — either way this must never block the rest of the
    // network from loading.
    prisma.dataStore.findUnique({ where: { key: "hermes-drive" } }),
  ]);

  const drive = readDriveMirror(driveRow?.data);

  const graph = buildNetworkGraph({
    memory,
    tasks,
    ideas,
    clients,
    events,
    requests,
    drive: drive.available ? drive.rows : [],
  });
  const health = computeNetworkHealth(graph);

  return NextResponse.json(
    {
      ...graph,
      health: {
        ...health,
        generatedAt: new Date().toISOString(),
        drive: drive.available ? { available: true } : { available: false, reason: drive.reason },
      },
    },
    { headers: { "Cache-Control": "no-store, no-cache" } }
  );
}
