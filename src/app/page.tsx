"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Lightbulb, ClipboardList } from "lucide-react";
import { HermesBriefing } from "@/components/hermes-briefing";
import { ApprovalInbox } from "@/components/approval-inbox";
import { NetworkPreviewCard } from "@/components/network-preview-card";
import { Eyebrow } from "@/components/ui/kit";

// ── Types ─────────────────────────────────────────────────
interface KanbanTask { id: string; title: string; assignee: string; status: string; priority: number }
interface HermesKanban { board: string; total: number; counts: Record<string, number>; tasks: KanbanTask[] }
interface RecentIdea { id: string; title: string; category: string | null }
interface ClientSnapshot { id: string; clientName: string; projectName: string; status: string; priority: string; dueDate: string | null }

interface HomeData {
  hermesKanban: HermesKanban;
  ideas: { pending: number; recent: RecentIdea[] };
  clients: { total: number; counts: Record<string, number>; active: ClientSnapshot[] };
  pendingApprovals: number;
}

const EMPTY: HomeData = {
  hermesKanban: { board: "default", total: 0, counts: {}, tasks: [] },
  ideas: { pending: 0, recent: [] },
  clients: { total: 0, counts: {}, active: [] },
  pendingApprovals: 0,
};

// ── Helpers ───────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Still up";
}
function dueLabel(d: string | null) {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="eyebrow">{children}</span>
      <span className="h-px flex-1 bg-[var(--hq-hairline)]" />
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[var(--hq-text-ghost)] text-[13px] py-8 text-center">{children}</p>;
}

// ── Stat strip ────────────────────────────────────────────
function StatCard({ label, value, href, tone }: { label: string; value: number | string; href: string; tone?: "warn" | "accent" }) {
  const color = tone === "warn" ? "var(--hq-warn)" : tone === "accent" ? "var(--accent)" : "var(--hq-text)";
  return (
    <a href={href} className="panel panel-interactive flex flex-col p-6">
      <Eyebrow>{label}</Eyebrow>
      <div className="num font-semibold text-[40px] leading-[0.95] tracking-[-0.02em] mt-3" style={{ color }}>
        {value}
      </div>
    </a>
  );
}

// ── Hermes Kanban ─────────────────────────────────────────
function HermesKanbanPanel({ kanban }: { kanban: HermesKanban }) {
  const statusColor = (s: string) => {
    const k = s.toLowerCase();
    if (k.includes("done") || k.includes("complete")) return "var(--hq-up)";
    if (k.includes("progress") || k.includes("doing")) return "var(--accent)";
    if (k.includes("block")) return "var(--hq-down)";
    return "var(--hq-text-faint)";
  };
  const entries = Object.entries(kanban.counts || {});
  return (
    <div className="panel flex flex-col p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="min-w-0">
          <span className="eyebrow">Hermes Board</span>
          <p className="text-[13px] text-[var(--hq-text-dim)] truncate mt-1">{kanban.board}</p>
        </div>
        <span className="num text-[22px] font-semibold text-[var(--hq-text)] shrink-0">{kanban.total}</span>
      </div>

      {entries.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {entries.map(([status, count]) => (
            <span key={status} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium num"
              style={{ color: statusColor(status), background: `color-mix(in srgb, ${statusColor(status)} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${statusColor(status)} 22%, transparent)` }}>
              {status} {count}
            </span>
          ))}
        </div>
      )}

      {kanban.tasks.length === 0 ? <Empty>No active tasks.</Empty> : (
        <div className="space-y-0">
          {kanban.tasks.slice(0, 5).map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2.5 border-b border-[var(--hq-hairline)] last:border-0">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusColor(t.status) }} />
              <p className="text-[13px] text-[var(--hq-text-dim)] leading-snug line-clamp-1 flex-1">{t.title}</p>
              {t.assignee && <span className="num text-[10.5px] text-[var(--hq-text-ghost)] shrink-0">{t.assignee}</span>}
            </div>
          ))}
        </div>
      )}
      <a href="/hermes" className="mt-auto pt-4 flex items-center gap-1 text-[var(--hq-text-faint)] text-[11px] font-medium hover:text-[var(--hq-text-dim)] transition-colors group">
        Open Hermes <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
      </a>
    </div>
  );
}

// ── Ideas panel ───────────────────────────────────────────
function IdeasPanel({ ideas }: { ideas: HomeData["ideas"] }) {
  return (
    <div className="panel flex flex-col p-6 h-full">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
        <span className="eyebrow">Open Ideas</span>
        <span className="num ml-auto text-[13px] text-[var(--hq-text-ghost)]">{ideas.pending}</span>
      </div>
      {ideas.recent.length === 0 ? <Empty>No open ideas yet.</Empty> : (
        <div className="space-y-1">
          {ideas.recent.map((idea, i) => (
            <a key={idea.id} href="/ideas" className="group flex gap-3 items-center py-2 border-b border-[var(--hq-hairline)] last:border-0">
              <span className="num text-[11px] text-[var(--hq-text-ghost)] w-5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
              <p className="text-[var(--hq-text-dim)] text-[13px] leading-snug line-clamp-1 flex-1 group-hover:text-[var(--hq-text)] transition-colors">{idea.title}</p>
              <ChevronRight className="w-3.5 h-3.5 text-[var(--hq-text-ghost)] group-hover:text-[var(--hq-text-dim)] shrink-0 transition-all group-hover:translate-x-0.5" />
            </a>
          ))}
        </div>
      )}
      <a href="/ideas" className="mt-auto pt-4 flex items-center gap-1 text-[var(--hq-text-faint)] text-[11px] font-medium hover:text-[var(--hq-text-dim)] transition-colors group">
        Open Idea Board <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
      </a>
    </div>
  );
}

// ── Client delivery panel ──────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  review: "Review",
  delivered: "Delivered",
};
function ClientsPanel({ clients }: { clients: HomeData["clients"] }) {
  const entries = Object.entries(clients.counts || {});
  return (
    <div className="panel flex flex-col p-6 h-full">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList className="w-3.5 h-3.5" style={{ color: "var(--hq-up)" }} />
        <span className="eyebrow">Client Delivery</span>
        <span className="num ml-auto text-[13px] text-[var(--hq-text-ghost)]">{clients.total}</span>
      </div>
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {entries.map(([status, count]) => (
            <span key={status} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium num text-[var(--hq-text-dim)] border border-[var(--hq-hairline)]">
              {STATUS_LABEL[status] || status} {count}
            </span>
          ))}
        </div>
      )}
      {clients.active.length === 0 ? <Empty>No active client projects.</Empty> : (
        <div className="space-y-1">
          {clients.active.map((p) => (
            <a key={p.id} href="/clients" className="group flex gap-3 items-center py-2 border-b border-[var(--hq-hairline)] last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-[var(--hq-text-dim)] text-[13px] leading-snug line-clamp-1 group-hover:text-[var(--hq-text)] transition-colors">{p.projectName}</p>
                <p className="text-[var(--hq-text-ghost)] text-[11px] mt-0.5">{p.clientName}</p>
              </div>
              {dueLabel(p.dueDate) && <span className="num text-[10.5px] text-[var(--hq-text-ghost)] shrink-0">due {dueLabel(p.dueDate)}</span>}
            </a>
          ))}
        </div>
      )}
      <a href="/clients" className="mt-auto pt-4 flex items-center gap-1 text-[var(--hq-text-faint)] text-[11px] font-medium hover:text-[var(--hq-text-dim)] transition-colors group">
        Open Client Board <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
      </a>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState<HomeData>(EMPTY);
  const [time, setTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);
  const [dataState, setDataState] = useState<"loading" | "ready" | "error">("loading");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/home", { cache: "no-store" });
        if (!response.ok) throw new Error("Home data unavailable");
        setData(await response.json());
        setUpdatedAt(new Date());
        setDataState("ready");
      } catch {
        setDataState("error");
      }
    };
    void load();
    const iv = setInterval(() => void load(), 60_000);
    return () => clearInterval(iv);
  }, []);

  if (!mounted) return null;

  const rise = (i: number) => ({ animationDelay: `${i * 60}ms` });

  return (
    <div className="relative z-10 w-full mx-auto pb-16">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="hq-rise pt-4 pb-10 flex flex-wrap items-end justify-between gap-6" style={rise(0)}>
        <div>
          <div className="eyebrow mb-2.5">{greeting()}</div>
          <h1 className="text-[40px] font-semibold tracking-[-0.025em] leading-none text-[var(--hq-text)]">{process.env.NEXT_PUBLIC_OWNER_NAME || "Founder"}</h1>
          <p className="num text-[var(--hq-text-ghost)] text-[12.5px] mt-3">
            {time.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            {"  ·  "}
            {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-[var(--hq-hairline)] bg-white/[0.02] px-2.5 py-1">
          <span className="inline-flex w-1.5 h-1.5 rounded-full" style={{ background: dataState === "ready" ? "var(--up)" : dataState === "error" ? "var(--down)" : "var(--hq-warn)" }} />
          <span className="eyebrow !text-[9.5px] !text-[var(--hq-text-faint)]">{dataState === "ready" ? `Synced ${updatedAt ? "just now" : ""}` : dataState === "error" ? "Data unavailable" : "Loading data"}</span>
        </div>
      </div>

      {/* ── Stat strip ─────────────────────────────────── */}
      <div className="hq-rise grid grid-cols-1 sm:grid-cols-3 gap-5" style={rise(1)}>
        <StatCard label="Awaiting approval" value={dataState === "ready" ? data.pendingApprovals : "—"} href="/hermes" tone="warn" />
        <StatCard label="Open ideas" value={dataState === "ready" ? data.ideas.pending : "—"} href="/ideas" tone="accent" />
        <StatCard label="Client projects" value={dataState === "ready" ? data.clients.total : "—"} href="/clients" />
      </div>

      {/* ── Needs your decision ─────────────────────────── */}
      <div className="mt-5 hq-rise" style={rise(2)}>
        <ApprovalInbox />
      </div>
      <div className="mt-5 hq-rise" style={rise(3)}>
        <HermesBriefing />
      </div>

      {/* ── Signal ──────────────────────────────────────── */}
      {dataState === "ready" ? <div className="mt-14">
        <SectionLabel>Signal</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          <div className="hq-rise" style={rise(4)}><HermesKanbanPanel kanban={data.hermesKanban} /></div>
          <div className="hq-rise" style={rise(5)}><IdeasPanel ideas={data.ideas} /></div>
          <div className="hq-rise" style={rise(6)}><ClientsPanel clients={data.clients} /></div>
          <div className="hq-rise" style={rise(7)}><NetworkPreviewCard /></div>
        </div>
      </div> : <div className="mt-8 panel p-5 text-[13px] text-[var(--hq-text-dim)]" role="alert">Operational summaries are unavailable until the dashboard reconnects. Approval decisions remain available above.</div>}
    </div>
  );
}
