"use client";

import { useEffect, useRef } from "react";
import { X, Copy, ExternalLink } from "lucide-react";
import type { NetworkEdge, NetworkNode } from "@/lib/network-graph";
import { Pill, Button, Eyebrow } from "@/components/ui/kit";
import { NODE_TYPE_LABEL, NODE_TYPE_LINK, NODE_TYPE_LINK_LABEL } from "./constants";

interface NetworkInspectorProps {
  node: NetworkNode | null;
  edges: NetworkEdge[];
  nodesById: Map<string, NetworkNode>;
  onClose: () => void;
  onSelectNode: (id: string) => void;
}

export function NetworkInspector({ node, edges, nodesById, onClose, onSelectNode }: NetworkInspectorProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (node) headingRef.current?.focus();
  }, [node]);

  useEffect(() => {
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [node, onClose]);

  if (!node) {
    return (
      <aside aria-label="Node inspector" className="panel p-6 h-full flex items-center justify-center text-center min-h-[220px]">
        <p className="text-[13px] text-[var(--text-3)] max-w-[24ch]">
          Select a node from the globe or the list to inspect its source, status, owner, and explicit connections.
        </p>
      </aside>
    );
  }

  const connections = edges.filter((e) => e.source === node.id || e.target === node.id);
  const copyId = () => { navigator.clipboard?.writeText(node.id).catch(() => {}); };

  return (
    <aside aria-label="Node inspector" className="panel p-6 h-full overflow-y-auto">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <Eyebrow>{NODE_TYPE_LABEL[node.type]}</Eyebrow>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="mt-1 text-[17px] font-semibold text-[var(--text)] outline-none leading-snug"
          >
            {node.label}
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close inspector"
          className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <dl className="space-y-3 text-[13px]">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[var(--text-3)]">Source</dt>
          <dd className="text-[var(--text-2)]">{node.source}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[var(--text-3)]">Status</dt>
          <dd>{node.status ? <Pill tone="neutral">{node.status}</Pill> : <span className="text-[var(--text-4)]">—</span>}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[var(--text-3)]">Owner</dt>
          <dd className="text-[var(--text-2)] truncate max-w-[60%] text-right">{node.owner ?? "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[var(--text-3)]">Updated</dt>
          <dd className="num text-[11px] text-[var(--text-3)]">
            {node.updatedAt ? new Date(node.updatedAt).toLocaleString() : "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-6">
        <Eyebrow>Explicit connections ({connections.length})</Eyebrow>
        {connections.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-[var(--text-4)] leading-relaxed">
            No recorded relationships. This is expected — the schema has no explicit link field wiring this record to
            anything else yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {connections.map((edge) => {
              const otherId = edge.source === node.id ? edge.target : edge.source;
              const other = nodesById.get(otherId);
              if (!other) return null;
              return (
                <li key={edge.id}>
                  <button
                    onClick={() => onSelectNode(other.id)}
                    className="w-full text-left flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-[var(--surface-2)] transition-colors"
                  >
                    <span className="text-[12.5px] text-[var(--text-2)] truncate">{other.label}</span>
                    <span className="text-[10.5px] text-[var(--text-4)] shrink-0">{edge.type}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {node.type === "drive" ? (
          node.webViewLink ? (
            <Button size="sm" href={node.webViewLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" /> Open in Drive
            </Button>
          ) : (
            <span className="text-[12px] text-[var(--text-4)] px-1 py-1.5">No link available</span>
          )
        ) : (
          NODE_TYPE_LINK[node.type] && (
            <Button size="sm" href={NODE_TYPE_LINK[node.type]}>{NODE_TYPE_LINK_LABEL[node.type]}</Button>
          )
        )}
        <Button size="sm" variant="ghost" onClick={copyId}>
          <Copy className="w-3.5 h-3.5" /> Copy ID
        </Button>
      </div>
    </aside>
  );
}
