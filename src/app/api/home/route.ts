import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HERMES_KANBAN_BOARD = process.env.HERMES_BOARD || "default";

interface KanbanTaskRow {
  id: string;
  title: string;
  assignee: string | null;
  status: string;
  priority: number | null;
}

function formatHermesKanban(tasks: KanbanTaskRow[]) {
  const counts = tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {});
  return {
    board: HERMES_KANBAN_BOARD,
    total: tasks.length,
    counts,
    tasks: [...tasks]
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, 6)
      .map((task) => ({
        id: task.id,
        title: task.title,
        assignee: task.assignee || "unassigned",
        status: task.status,
        priority: task.priority || 0,
      })),
  };
}

export async function GET() {
  const [tasksResult, ideasPendingResult, recentIdeasResult, clientProjectsResult, pendingApprovalsResult] =
    await Promise.allSettled([
      prisma.hermesTask.findMany({ orderBy: [{ priority: "desc" }], take: 50 }),
      prisma.idea.count({ where: { status: { notIn: ["done", "rejected"] } } }),
      prisma.idea.findMany({ where: { status: { notIn: ["done", "rejected"] } }, orderBy: { timestamp: "desc" }, take: 5 }),
      prisma.clientProject.findMany({ orderBy: { updatedAt: "desc" } }),
      prisma.agentRequest.count({ where: { status: "awaiting_approval" } }),
    ]);

  if ([tasksResult, ideasPendingResult, recentIdeasResult, clientProjectsResult, pendingApprovalsResult].some((result) => result.status === "rejected")) {
    return NextResponse.json({ error: "Home data is temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store, no-cache" } });
  }

  const tasks = tasksResult.status === "fulfilled" ? tasksResult.value : [];
  const hermesKanban = formatHermesKanban(tasks);

  const ideasPending = ideasPendingResult.status === "fulfilled" ? ideasPendingResult.value : 0;
  const recentIdeas = recentIdeasResult.status === "fulfilled" ? recentIdeasResult.value : [];

  const clientProjects = clientProjectsResult.status === "fulfilled" ? clientProjectsResult.value : [];
  const clientCounts = clientProjects.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});
  const activeClientProjects = clientProjects.filter((p) => p.status !== "delivered").slice(0, 5);

  const pendingApprovals = pendingApprovalsResult.status === "fulfilled" ? pendingApprovalsResult.value : 0;

  return NextResponse.json(
    {
      hermesKanban,
      ideas: {
        pending: ideasPending,
        recent: recentIdeas.map((i) => ({ id: i.id, title: i.title, category: i.category })),
      },
      clients: {
        total: clientProjects.length,
        counts: clientCounts,
        active: activeClientProjects.map((p) => ({
          id: p.id,
          clientName: p.clientName,
          projectName: p.projectName,
          status: p.status,
          priority: p.priority,
          dueDate: p.dueDate,
        })),
      },
      pendingApprovals,
    },
    { headers: { "Cache-Control": "no-store, no-cache" } }
  );
}
