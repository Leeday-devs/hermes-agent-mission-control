import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await prisma.clientProject.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const clientName = (b.clientName || "").toString().trim();
  const projectName = (b.projectName || "").toString().trim();
  if (!clientName || !projectName) {
    return NextResponse.json({ error: "clientName and projectName are required" }, { status: 400 });
  }
  const project = await prisma.clientProject.create({
    data: {
      clientName: clientName.slice(0, 200),
      projectName: projectName.slice(0, 200),
      status: (b.status || "not_started").toString(),
      priority: (b.priority || "medium").toString(),
      notes: b.notes ? b.notes.toString() : null,
      dueDate: b.dueDate ? new Date(b.dueDate) : null,
    },
  });
  return NextResponse.json({ project });
}

export async function PATCH(req: Request) {
  const b = await req.json().catch(() => ({}));
  const { id, ...rest } = b;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof rest.clientName === "string") data.clientName = rest.clientName.slice(0, 200);
  if (typeof rest.projectName === "string") data.projectName = rest.projectName.slice(0, 200);
  if (typeof rest.status === "string") data.status = rest.status;
  if (typeof rest.priority === "string") data.priority = rest.priority;
  if (typeof rest.notes === "string" || rest.notes === null) data.notes = rest.notes;
  if (rest.dueDate !== undefined) data.dueDate = rest.dueDate ? new Date(rest.dueDate) : null;

  try {
    const project = await prisma.clientProject.update({ where: { id }, data });
    return NextResponse.json({ project });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function DELETE(req: Request) {
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.clientProject.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
