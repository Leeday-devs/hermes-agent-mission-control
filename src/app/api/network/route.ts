import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildNetworkGraph, computeNetworkHealth } from "@/lib/network-graph";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Deliberately narrow selects: never fetch AgentEvent.meta, AgentRequest
// prompt/result/error, or anything OAuth/env related. These fields must
// never reach the network graph or the client.
export async function GET() {
  const [memory, tasks, ideas, clients, events, requests] = await Promise.all([
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
  ]);

  const graph = buildNetworkGraph({ memory, tasks, ideas, clients, events, requests });
  const health = computeNetworkHealth(graph);

  return NextResponse.json(
    { ...graph, health: { ...health, generatedAt: new Date().toISOString() } },
    { headers: { "Cache-Control": "no-store, no-cache" } }
  );
}
