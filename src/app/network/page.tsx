"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Share2 } from "lucide-react";
import { Eyebrow, Skeleton, rise } from "@/components/ui/kit";
import { NetworkGlobe } from "@/components/network/network-globe";
import { NetworkInspector } from "@/components/network/network-inspector";
import { NODE_TYPES, NODE_TYPE_COLOR_VAR, NODE_TYPE_LABEL } from "@/components/network/constants";
import type { NetworkEdge, NetworkNode, NetworkNodeType } from "@/lib/network-graph";

interface NetworkHealth {
  totalNodes: number;
  totalEdges: number;
  orphanedNodes: number;
  generatedAt: string;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "—";
  const s = Math.floor(diff / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function HealthStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="eyebrow !text-[9.5px]">{label}</span>
      <span className="num text-[20px] font-semibold text-[var(--text)] leading-none">{value}</span>
    </div>
  );
}

function NodeListPanel({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: NetworkNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-3">
        <Eyebrow>Nodes</Eyebrow>
        <span className="num text-[11px] text-[var(--text-4)]">{nodes.length} shown</span>
      </div>
      {nodes.length === 0 ? (
        <p className="text-[13px] text-[var(--text-3)] py-8 text-center">No nodes match the current filters.</p>
      ) : (
        <ul role="listbox" aria-label="Network nodes" className="max-h-[420px] overflow-y-auto space-y-0.5 -mx-1">
          {nodes.map((n) => (
            <li key={n.id}>
              <button
                role="option"
                aria-selected={n.id === selectedId}
                onClick={() => onSelect(n.id)}
                className={`w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg transition-colors ${
                  n.id === selectedId
                    ? "bg-[var(--surface-2)] text-[var(--text)]"
                    : "text-[var(--text-2)] hover:bg-[var(--surface-1)] hover:text-[var(--text)]"
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: `var(${NODE_TYPE_COLOR_VAR[n.type]})` }}
                  aria-hidden
                />
                <span className="flex-1 min-w-0 truncate text-[13px]">{n.label}</span>
                {n.orphaned && <span className="text-[10px] text-[var(--text-4)] shrink-0">orphan</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function NetworkPage() {
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [edges, setEdges] = useState<NetworkEdge[]>([]);
  const [health, setHealth] = useState<NetworkHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeTypes, setActiveTypes] = useState<Set<NetworkNodeType>>(new Set(NODE_TYPES));
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/network", { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = await res.json();
      setNodes(data.nodes ?? []);
      setEdges(data.edges ?? []);
      setHealth(data.health ?? null);
    } catch {
      setError("Could not load the network. Try refreshing.");
    } finally {
      setLoading(false);
    }
    // Manual refresh only — no background polling.
  }, []);

  useEffect(() => { load(); }, [load]);

  const statuses = useMemo(
    () => [...new Set(nodes.map((n) => n.status).filter((s): s is string => Boolean(s)))].sort(),
    [nodes]
  );

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return nodes.filter((n) => {
      if (!activeTypes.has(n.type)) return false;
      if (statusFilter !== "all" && n.status !== statusFilter) return false;
      if (q) {
        const haystack = `${n.label} ${n.owner ?? ""} ${n.source}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [nodes, activeTypes, statusFilter, q]);

  const visibleIds = useMemo(() => new Set(filtered.map((n) => n.id)), [filtered]);
  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const selectedNode = selectedId ? nodesById.get(selectedId) ?? null : null;

  const neighborIds = useMemo(() => {
    const set = new Set<string>();
    if (!selectedId) return set;
    for (const e of edges) {
      if (e.source === selectedId) set.add(e.target);
      if (e.target === selectedId) set.add(e.source);
    }
    return set;
  }, [edges, selectedId]);

  const toggleType = (t: NetworkNodeType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next.size === 0 ? new Set(NODE_TYPES) : next;
    });
  };

  const typeCounts = useMemo(() => {
    const counts: Partial<Record<NetworkNodeType, number>> = {};
    for (const n of nodes) counts[n.type] = (counts[n.type] ?? 0) + 1;
    return counts;
  }, [nodes]);

  const emptyCategories = NODE_TYPES.filter((t) => !typeCounts[t]);
  const showSparseNote = !loading && !error && nodes.length > 0 && emptyCategories.length >= 4;

  return (
    <div className="w-full mx-auto pb-16">
      {/* Header */}
      <div className="hq-rise flex flex-wrap items-end justify-between gap-4 pt-2 pb-8" style={rise(0)}>
        <div>
          <div className="eyebrow mb-2.5 flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5" />
            Network
          </div>
          <h1 className="text-[32px] font-semibold tracking-[-0.025em] leading-none text-[var(--text)]">
            Knowledge Network
          </h1>
          <p className="text-[var(--text-3)] text-[13px] mt-3 max-w-md">
            Every recorded, explicit relationship between Hermes memory, tasks, ideas, client projects, agents and
            events — nothing inferred.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium btn-ghost disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Health strip */}
      <div className="hq-rise panel p-5 grid grid-cols-2 sm:grid-cols-5 gap-5 mb-6" style={rise(1)}>
        <HealthStat label="Total nodes" value={health?.totalNodes ?? "—"} />
        <HealthStat label="Connections" value={health?.totalEdges ?? "—"} />
        <HealthStat label="Orphaned" value={health?.orphanedNodes ?? "—"} />
        <HealthStat label="Visible now" value={filtered.length} />
        <HealthStat label="Last refresh" value={timeAgo(health?.generatedAt ?? null)} />
      </div>

      {error && (
        <div className="hq-rise panel p-4 mb-6 text-[13px]" style={{ color: "var(--down)" }}>
          {error}
        </div>
      )}

      {showSparseNote && (
        <div className="hq-rise panel p-4 mb-6 text-[12.5px] text-[var(--text-3)] leading-relaxed" style={rise(2)}>
          Sparse data: {emptyCategories.map((t) => NODE_TYPE_LABEL[t]).join(", ")} have no recorded entries yet, so
          they don&apos;t appear on the globe. This reflects the current database state — nothing here is a demo
          record.
        </div>
      )}

      {/* Controls */}
      <div className="hq-rise flex flex-wrap items-center gap-2 mb-6" style={rise(3)}>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-4)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes…"
            className="bg-[var(--surface-2)] border border-[var(--line)] rounded-full pl-8 pr-3 py-1.5 text-[12.5px] text-[var(--text)] placeholder:text-[var(--text-4)] focus:outline-none focus:border-[var(--line-strong)] transition-colors w-48"
          />
        </div>
        {NODE_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => toggleType(t)}
            aria-pressed={activeTypes.has(t)}
            className={`px-3 py-1.5 rounded-full text-[11.5px] font-medium transition-colors flex items-center gap-1.5 border ${
              activeTypes.has(t)
                ? "bg-[var(--surface-2)] text-[var(--text)] border-[var(--line-strong)]"
                : "text-[var(--text-4)] border-[var(--line)] hover:text-[var(--text-2)]"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: `var(${NODE_TYPE_COLOR_VAR[t]})` }} />
            {NODE_TYPE_LABEL[t]}
            <span className="num text-[10px] text-[var(--text-4)]">{typeCounts[t] ?? 0}</span>
          </button>
        ))}
        {statuses.length > 0 && (
          <>
            <div className="w-px h-4 bg-[var(--line)] mx-1" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent border border-[var(--line)] text-[var(--text-2)] px-3 py-1.5 rounded-full text-[12px] focus:outline-none focus:border-[var(--line-strong)]"
            >
              <option value="all">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Main */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5">
          <Skeleton className="h-[500px] w-full" />
          <Skeleton className="h-[500px] w-full" />
        </div>
      ) : (
        <div className="hq-rise grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start" style={rise(4)}>
          <div className="space-y-5 min-w-0">
            {/* Desktop-only sphere — mobile gets the compact node list below as its fallback. */}
            <div className="hidden md:block panel p-2 h-[500px] overflow-hidden">
              <NetworkGlobe
                nodes={nodes}
                edges={edges}
                visibleIds={visibleIds}
                selectedId={selectedId}
                neighborIds={neighborIds}
                onSelect={setSelectedId}
              />
            </div>
            <NodeListPanel nodes={filtered} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
          <div className="lg:sticky lg:top-6">
            <NetworkInspector
              node={selectedNode}
              edges={edges}
              nodesById={nodesById}
              onClose={() => setSelectedId(null)}
              onSelectNode={setSelectedId}
            />
          </div>
        </div>
      )}
    </div>
  );
}
