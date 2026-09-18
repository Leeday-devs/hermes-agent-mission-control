"use client";

/* ───────────────────────────────────────────────────────────
   Hermy HQ · Network focus view
   Compact 2D neighborhood diagram for mobile — the selected node
   at the center with its direct explicit neighbors on a ring.
   Plain SVG, no canvas, no dependency on the 3D globe.
   ─────────────────────────────────────────────────────────── */

import { useState } from "react";
import { Eyebrow } from "@/components/ui/kit";
import type { NetworkEdge, NetworkNode } from "@/lib/network-graph";
import { computeRadialLayout, describeNeighborRelationships, getDirectNeighbors, uniqueDirectNeighbors } from "@/lib/network-interactions";
import { NODE_TYPE_COLOR_VAR, NODE_TYPE_LABEL } from "./constants";

interface NetworkFocusViewProps {
  node: NetworkNode | null;
  edges: NetworkEdge[];
  nodesById: Map<string, NetworkNode>;
  onSelect: (id: string) => void;
}

function truncateLabel(label: string, max = 14): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

const SIZE = 280;
const CENTER = SIZE / 2;
const RADIUS = SIZE * 0.34;

export function NetworkFocusView({ node, edges, nodesById, onSelect }: NetworkFocusViewProps) {
  const [focusedNeighborId, setFocusedNeighborId] = useState<string | null>(null);
  if (!node) {
    return (
      <div className="panel p-6 text-center md:hidden">
        <p className="text-[13px] text-[var(--text-3)]">
          Select a node below to see its direct connections here.
        </p>
      </div>
    );
  }

  const neighbors = getDirectNeighbors(edges, node.id);
  const uniqueNeighbors = uniqueDirectNeighbors(edges, node.id);
  const layout = computeRadialLayout(node.id, uniqueNeighbors.map((n) => n.neighborId));
  const toScreen = (p: { x: number; y: number }) => ({ x: CENTER + p.x * RADIUS, y: CENTER + p.y * RADIUS });
  const centerPoint = toScreen(layout.get(node.id)!);
  const description = uniqueNeighbors.map(({ neighborId }) => {
    const other = nodesById.get(neighborId);
    const relationships = describeNeighborRelationships(edges, node.id, neighborId).join(", ");
    return `${other?.label ?? neighborId}: ${relationships}`;
  }).join("; ");

  return (
    <div className="panel p-4 md:hidden">
      <div className="flex items-center justify-between mb-2">
        <Eyebrow>Neighborhood</Eyebrow>
        <span className="num text-[11px] text-[var(--text-4)]">
          {neighbors.length} connection{neighbors.length === 1 ? "" : "s"}
        </span>
      </div>
      {neighbors.length === 0 ? (
        <p className="text-[12.5px] text-[var(--text-4)] leading-relaxed py-6 text-center">
          No recorded relationships for this node.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`${node.label} and its ${neighbors.length} direct connection${neighbors.length === 1 ? "" : "s"}`}
          aria-describedby="network-neighborhood-description"
          className="w-full max-w-[300px] mx-auto"
        >
          <desc id="network-neighborhood-description">
            Direct explicit relationships: {description}. Each colored neighbor is keyboard selectable.
          </desc>
          {neighbors.map(({ edge, neighborId }) => {
            const p = toScreen(layout.get(neighborId)!);
            return (
              <line
                key={edge.id}
                x1={centerPoint.x}
                y1={centerPoint.y}
                x2={p.x}
                y2={p.y}
                stroke="var(--line-strong)"
                strokeWidth={1}
              />
            );
          })}
          {uniqueNeighbors.map(({ neighborId }) => {
            const other = nodesById.get(neighborId);
            if (!other) return null;
            const p = toScreen(layout.get(neighborId)!);
            const relationships = describeNeighborRelationships(edges, node.id, neighborId).join(", ");
            const isFocused = focusedNeighborId === neighborId;
            return (
              <g
                key={neighborId}
                transform={`translate(${p.x},${p.y})`}
                role="button"
                tabIndex={0}
                aria-label={`Focus ${other.label} (${NODE_TYPE_LABEL[other.type]}): ${relationships}`}
                className="cursor-pointer outline-none"
                onClick={() => onSelect(neighborId)}
                onFocus={() => setFocusedNeighborId(neighborId)}
                onBlur={() => setFocusedNeighborId(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(neighborId);
                  }
                }}
              >
                <circle
                  r={isFocused ? 12 : 9}
                  fill={`var(${NODE_TYPE_COLOR_VAR[other.type]})`}
                  stroke={isFocused ? "rgba(255,255,255,0.95)" : "var(--surface-0)"}
                  strokeWidth={isFocused ? 3 : 1}
                />
                <text y={20} textAnchor="middle" fill={isFocused ? "var(--text)" : "var(--text-3)"} style={{ fontSize: 9 }}>
                  {truncateLabel(other.label)}
                </text>
              </g>
            );
          })}
          <g transform={`translate(${centerPoint.x},${centerPoint.y})`}>
            <circle
              r={13}
              fill={`var(${NODE_TYPE_COLOR_VAR[node.type]})`}
              stroke="rgba(255,255,255,0.85)"
              strokeWidth={1.5}
            />
            <text y={-20} textAnchor="middle" fill="var(--text)" style={{ fontSize: 10, fontWeight: 600 }}>
              {truncateLabel(node.label)}
            </text>
          </g>
        </svg>
      )}
    </div>
  );
}
