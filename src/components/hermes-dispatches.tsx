"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { ChevronRight, Send } from "lucide-react";
import { SectionHeader, Panel, Pill, EmptyState } from "@/components/ui/kit";

type Req = {
  id: string;
  origin: string;
  kind: string;
  title: string;
  prompt: string | null;
  sideEffecting: boolean;
  status: string;
  result: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

function ago(d: string | null): string {
  if (!d) return "";
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// End defaults to now when a request is still running, so duration ticks
// forward on every poll instead of freezing at "—".
function duration(start: string | null, finish: string | null): string {
  if (!start) return "";
  const end = finish ? new Date(finish).getTime() : Date.now();
  const ms = end - new Date(start).getTime();
  if (Number.isNaN(ms) || ms < 0) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalS = Math.round(ms / 1000);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function timingLabel(r: Req): string {
  if (r.finishedAt) return `finished ${ago(r.finishedAt)}`;
  if (r.startedAt) return `started ${ago(r.startedAt)}`;
  return `queued ${ago(r.createdAt)}`;
}

// The bridge already writes a concise, multi-line diagnostic (see
// hermes-bridge/lib/error-format.mjs); collapsed cards only need its
// headline so the list stays scannable.
function firstLine(s: string | null): string {
  if (!s) return "";
  return s.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduce;
}

const TONE: Record<string, "neutral" | "up" | "down" | "warn" | "accent"> = {
  queued: "neutral",
  awaiting_approval: "warn",
  approved: "accent",
  running: "accent",
  done: "up",
  failed: "down",
  rejected: "neutral",
};
const LABEL: Record<string, string> = {
  queued: "Queued",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  running: "Running",
  done: "Done",
  failed: "Failed",
  rejected: "Rejected",
};

function DispatchCard({ r, reduce }: { r: Req; reduce: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleId = useId();
  const tone = TONE[r.status] ?? "neutral";
  const running = r.status === "running";
  const canExpand = !!(r.prompt || r.result || r.error);
  const dur = duration(r.startedAt, r.finishedAt);
  const diagnosis = r.status === "failed" ? firstLine(r.error) : "";
  const showPrompt = !!r.prompt && r.prompt.trim() !== r.title.trim();

  const toggle = useCallback(() => {
    if (canExpand) setOpen((o) => !o);
  }, [canExpand]);

  return (
    <div className="panel p-4">
      {/* A native <button> can only contain phrasing content, but this
          full-width toggle needs block-level children (stacked timing rows,
          the Pill chip) — so it's a div with the button role and manual
          Enter/Space handling instead. */}
      <div
        role={canExpand ? "button" : undefined}
        tabIndex={canExpand ? 0 : undefined}
        onClick={toggle}
        onKeyDown={(e) => {
          if (!canExpand) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        aria-expanded={canExpand ? open : undefined}
        aria-controls={canExpand ? panelId : undefined}
        className={`w-full flex items-center gap-3 text-left ${canExpand ? "cursor-pointer" : "cursor-default"}`}
      >
        {running && (
          <span className="relative flex w-1.5 h-1.5 shrink-0">
            {!reduce && (
              <span
                className="absolute inline-flex h-full w-full rounded-full animate-ping"
                style={{ background: "color-mix(in srgb, var(--accent) 60%, transparent)" }}
              />
            )}
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p id={titleId} className="text-[14px] text-[var(--text)] truncate">{r.title}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-[var(--text-3)] truncate">{r.kind}</span>
            <Pill tone={tone} className="!py-0.5 !text-[10px]">{LABEL[r.status] ?? r.status}</Pill>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-3 text-right">
          <div>
            <div className="num text-[12px] text-[var(--text-2)]">{dur || "—"}</div>
            <div className="num text-[10.5px] text-[var(--text-3)] mt-0.5">{timingLabel(r)}</div>
          </div>
          {canExpand && (
            <ChevronRight
              className="w-3.5 h-3.5 text-[var(--text-3)] transition-transform motion-reduce:transition-none"
              style={{ transform: open ? "rotate(90deg)" : "none" }}
            />
          )}
        </div>
      </div>

      {diagnosis && (
        <p className="mt-2.5 text-[12.5px] leading-snug truncate text-[var(--down)]">{diagnosis}</p>
      )}

      {open && canExpand && (
        <div id={panelId} role="region" aria-labelledby={titleId} className="mt-3 flex flex-col gap-3">
          <div>
            <p className="text-[10.5px] uppercase tracking-wide text-[var(--text-3)] mb-1">Task</p>
            <p className="text-[13px] text-[var(--text-2)] leading-snug whitespace-pre-wrap">{r.title}</p>
          </div>

          {showPrompt && (
            <div>
              <p className="text-[10.5px] uppercase tracking-wide text-[var(--text-3)] mb-1">Prompt</p>
              <p className="text-[13px] text-[var(--text-2)] leading-snug whitespace-pre-wrap rounded-[8px] border border-[var(--line)] bg-[var(--surface-2)] p-3">
                {r.prompt}
              </p>
            </div>
          )}

          {r.error ? (
            <div>
              <p className="text-[10.5px] uppercase tracking-wide text-[var(--text-3)] mb-1">Failure</p>
              <p className="text-[12.5px] leading-snug whitespace-pre-wrap rounded-[8px] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[var(--down)]">
                {r.error}
              </p>
            </div>
          ) : r.result ? (
            <div>
              <p className="text-[10.5px] uppercase tracking-wide text-[var(--text-3)] mb-1">Outcome</p>
              <p className="text-[12.5px] leading-snug whitespace-pre-wrap rounded-[8px] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[var(--text-2)]">
                {r.result}
              </p>
            </div>
          ) : null}

          <div>
            <p className="text-[10.5px] uppercase tracking-wide text-[var(--text-3)] mb-1">Timing</p>
            <p className="num text-[12px] text-[var(--text-3)]">
              queued {ago(r.createdAt)}
              {r.startedAt && ` · started ${ago(r.startedAt)}`}
              {r.finishedAt && ` · finished ${ago(r.finishedAt)}`}
              {dur && ` · duration ${dur}`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function HermesDispatches() {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [loaded, setLoaded] = useState(false);
  const reduce = usePrefersReducedMotion();

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/hermes/requests?take=15");
      if (r.ok) { const d = await r.json(); setReqs(d.requests ?? []); }
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [load]);

  return (
    <div>
      <SectionHeader label="Dispatches" title="What you've sent Hermes" />
      {!loaded ? (
        <Panel><div className="sk h-24 m-1 rounded-[10px]" /></Panel>
      ) : reqs.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Send className="w-5 h-5" />}
            title="No dispatches yet"
            hint="Send a task with ⌘K or the bar above — it'll appear here with its live status and result."
          />
        </Panel>
      ) : (
        <div className="flex flex-col gap-2.5">
          {reqs.map((r) => (
            <DispatchCard key={r.id} r={r} reduce={reduce} />
          ))}
        </div>
      )}
    </div>
  );
}
