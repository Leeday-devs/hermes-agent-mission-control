"use client";

import { useEffect, useState } from "react";
import { Button, Pill, rise } from "@/components/ui/kit";

interface Project {
  id: string;
  clientName: string;
  projectName: string;
  status: string;
  priority: string;
  notes: string | null;
  dueDate: string | null;
  updatedAt: string;
}

const columns = [
  { id: "not_started", label: "Not started" },
  { id: "in_progress", label: "In progress" },
  { id: "review", label: "Review" },
  { id: "delivered", label: "Delivered" },
];

const priorityTone: Record<string, "warn" | "down" | "neutral"> = {
  high: "down",
  medium: "warn",
  low: "neutral",
};

function dueLabel(d: string | null) {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ClientsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [clientName, setClientName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [priority, setPriority] = useState("medium");

  async function fetchProjects() {
    try {
      const res = await fetch("/api/clients");
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (e) {
      console.error("Failed to fetch client projects", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  async function addProject() {
    if (!clientName.trim() || !projectName.trim()) return;
    try {
      await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, projectName, priority, status: "not_started" }),
      });
      setClientName("");
      setProjectName("");
      setPriority("medium");
      setShowAdd(false);
      fetchProjects();
    } catch (e) {
      console.error("Failed to add client project", e);
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      await fetch("/api/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      fetchProjects();
    } catch (e) {
      console.error("Failed to update client project", e);
    }
  }

  if (loading) {
    return (
      <div className="relative z-10 w-full mx-auto pt-4">
        <div className="flex justify-between items-center mb-10">
          <div>
            <div className="sk h-3 w-20 mb-3" />
            <div className="sk h-7 w-28" />
          </div>
          <div className="sk h-9 w-28 rounded-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="panel p-4">
              <div className="sk h-4 w-16 mb-4" />
              <div className="space-y-2">
                {[...Array(i + 1)].map((_, j) => <div key={j} className="sk h-16 rounded-[var(--r-md)]" />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10 h-full flex flex-col w-full mx-auto pt-4 pb-16">
      <div className="hq-rise flex justify-between items-end gap-4 mb-10" style={rise(0)}>
        <div>
          <div className="eyebrow mb-2">Client delivery</div>
          <h1 className="text-[32px] font-semibold tracking-[-0.025em] leading-none text-[var(--text)]">Clients</h1>
        </div>
        <Button variant="primary" onClick={() => setShowAdd(true)}>+ Add project</Button>
      </div>

      {showAdd && (
        <div className="hq-rise elevated mb-8 p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Client name"
              className="w-full bg-[var(--surface-1)] border border-[var(--line)] text-[var(--text)] placeholder-[var(--text-3)] rounded-[var(--r-md)] px-4 py-3 text-[14px] focus:outline-none focus:border-[var(--line-strong)]"
              autoFocus
            />
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Project (e.g. Website redesign)"
              onKeyDown={(e) => e.key === "Enter" && addProject()}
              className="w-full bg-[var(--surface-1)] border border-[var(--line)] text-[var(--text)] placeholder-[var(--text-3)] rounded-[var(--r-md)] px-4 py-3 text-[14px] focus:outline-none focus:border-[var(--line-strong)]"
            />
          </div>
          <div className="flex items-center gap-3">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="bg-[var(--surface-1)] border border-[var(--line)] text-[var(--text-2)] rounded-[var(--r-md)] px-3 py-2 text-[13px] focus:outline-none"
            >
              <option value="low">Low priority</option>
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
            </select>
            <Button variant="primary" onClick={addProject}>Add project</Button>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 overflow-hidden">
        {columns.map((column, idx) => {
          const items = projects.filter((p) => p.status === column.id);
          return (
            <div key={column.id} className="hq-rise panel flex flex-col overflow-hidden" style={rise(idx + 1)}>
              <div className="px-4 py-3.5 flex items-center justify-between">
                <span className="eyebrow">{column.label}</span>
                <span className="num text-[11px] text-[var(--text-3)]">{items.length}</span>
              </div>
              <div className="rule" />
              <div className="flex-1 p-2.5 space-y-2 overflow-y-auto">
                {items.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    done={column.id === "delivered"}
                    onStatusChange={(status) => updateStatus(project.id, status)}
                  />
                ))}
                {items.length === 0 && (
                  <p className="text-[var(--text-4)] text-[12.5px] text-center py-8">No projects</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  done,
  onStatusChange,
}: {
  project: Project;
  done?: boolean;
  onStatusChange: (status: string) => void;
}) {
  const due = dueLabel(project.dueDate);
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] p-3.5 transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] cursor-pointer group">
      <p className={`font-medium text-[13px] mb-1 leading-relaxed ${done ? "text-[var(--text-3)] line-through" : "text-[var(--text)]"}`}>
        {project.projectName}
      </p>
      <p className="text-[12px] text-[var(--text-3)] mb-3">{project.clientName}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <Pill tone={priorityTone[project.priority] || "neutral"}>{project.priority}</Pill>
        {due && <span className="num text-[11px] text-[var(--text-3)]">due {due}</span>}
      </div>
      <div className="mt-3 pt-3 border-t border-[var(--line)] opacity-0 group-hover:opacity-100 transition-opacity">
        <select
          className="text-[12px] bg-[var(--surface-1)] text-[var(--text-2)] rounded-[var(--r-sm)] px-3 py-2 w-full border border-[var(--line)] focus:outline-none focus:border-[var(--line-strong)]"
          value={project.status}
          onChange={(e) => onStatusChange(e.target.value)}
        >
          {columns.map((col) => (
            <option key={col.id} value={col.id}>
              Move to {col.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
