"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { NetworkEdge, NetworkNode, NetworkNodeType } from "@/lib/network-graph";
import { buildNetworkClusters, computeClusterGridLayout } from "@/lib/network-interactions";
import { NODE_TYPE_COLOR_VAR, NODE_TYPE_LABEL } from "./constants";

const MIN_ZOOM = 0.55;
const MAX_ZOOM = 2.4;
const OVERVIEW_ZOOM = 0.92;
const MAP_WIDTH = 1200;
const MAP_HEIGHT = 760;
const MAP_CENTER = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };

type Point = { x: number; y: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pointOnRing(index: number, total: number, center: Point, radius: number): Point {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
}

function nodeRadius(node: NetworkNode, selectedId: string | null, neighborIds: Set<string>) {
  if (node.id === selectedId) return 14;
  if (neighborIds.has(node.id)) return 10;
  return node.orphaned ? 7 : 8;
}

export interface NetworkGlobeProps {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  visibleIds: Set<string>;
  selectedId: string | null;
  neighborIds: Set<string>;
  onSelect: (id: string | null) => void;
}

// The original globe was visually striking but hard to read. This flat,
// responsive map deliberately mirrors Obsidian's useful graph behaviour.
export function NetworkGlobe({ nodes, edges, visibleIds, selectedId, neighborIds, onSelect }: NetworkGlobeProps) {
  const [zoom, setZoom] = useState(0.78);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [focusedType, setFocusedType] = useState<NetworkNodeType | null>(null);
  const drag = useRef<{ x: number; y: number; pan: Point; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const visibleNodes = useMemo(() => nodes.filter((node) => visibleIds.has(node.id)), [nodes, visibleIds]);
  const visibleEdges = useMemo(
    () => edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target) && edge.type !== "ai-suggestion"),
    [edges, visibleIds]
  );
  const clusters = useMemo(() => buildNetworkClusters(visibleNodes, visibleEdges), [visibleEdges, visibleNodes]);
  const focusNodes = useMemo(
    () => (focusedType ? visibleNodes.filter((node) => node.type === focusedType) : visibleNodes),
    [focusedType, visibleNodes]
  );
  const mapNodes = useMemo(
    () => (focusedType && selectedId ? visibleNodes.filter((node) => node.type === focusedType || neighborIds.has(node.id)) : focusNodes),
    [focusNodes, focusedType, neighborIds, selectedId, visibleNodes]
  );
  const mapIds = useMemo(() => new Set(mapNodes.map((node) => node.id)), [mapNodes]);
  const mapEdges = useMemo(
    () => visibleEdges.filter((edge) => mapIds.has(edge.source) && mapIds.has(edge.target)),
    [mapIds, visibleEdges]
  );
  const mapClusters = useMemo(() => buildNetworkClusters(mapNodes, mapEdges), [mapEdges, mapNodes]);

  useEffect(() => {
    if (focusedType && !visibleNodes.some((node) => node.type === focusedType)) {
      setFocusedType(null);
      onSelect(null);
    }
  }, [focusedType, onSelect, visibleNodes]);

  const layout = (() => {
    const positions = new Map<string, Point>();
    let nextY = 120;
    for (const cluster of [...mapClusters].sort((a, b) => a.type.localeCompare(b.type))) {
      const columns = cluster.nodeIds.length > 80 ? 12 : cluster.nodeIds.length > 30 ? 8 : 5;
      const grid = computeClusterGridLayout(cluster.nodeIds, columns);
      const rows = Math.ceil(cluster.nodeIds.length / columns);
      const anchor = { x: 170, y: nextY };
      for (const [id, point] of grid) {
        positions.set(id, { x: anchor.x + point.x * 260, y: anchor.y + point.y * 105 });
      }
      nextY += Math.max(260, rows * 105 + 210);
    }
    return { positions };
  })();

  const reset = () => {
    setZoom(0.78);
    setPan({ x: 0, y: 0 });
    setFocusedType(null);
    onSelect(null);
  };
  const updateZoom = (amount: number) => setZoom((value) => clamp(Number((value + amount).toFixed(2)), MIN_ZOOM, MAX_ZOOM));
  const semanticLevel = zoom < OVERVIEW_ZOOM ? "Overview: categories" : zoom < 1.45 ? "Map: labelled records" : "Detail: labelled records";
  const showRecords = zoom >= OVERVIEW_ZOOM;

  return (
    <div className="relative h-full min-h-[470px] overflow-hidden rounded-xl bg-[#070a12]">
      <div className="absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.13) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        role="img"
        aria-label={`Zoomable knowledge network. ${semanticLevel}. Use zoom controls or your mouse wheel; select a labelled node to inspect it.`}
        className="relative h-full w-full touch-none select-none"
        onWheel={(event) => { event.preventDefault(); updateZoom(event.deltaY > 0 ? -0.12 : 0.12); }}
        onPointerDown={(event) => { drag.current = { x: event.clientX, y: event.clientY, pan, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const dx = event.clientX - drag.current.x;
          const dy = event.clientY - drag.current.y;
          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.current.moved = true;
          setPan({ x: drag.current.pan.x + dx / zoom, y: drag.current.pan.y + dy / zoom });
        }}
        onPointerUp={() => { suppressClick.current = Boolean(drag.current?.moved); drag.current = null; }}
        onPointerLeave={() => { drag.current = null; }}
      >
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {showRecords && selectedId && mapEdges.filter((edge) => edge.source === selectedId || edge.target === selectedId).map((edge) => {
            const source = layout.positions.get(edge.source);
            const target = layout.positions.get(edge.target);
            if (!source || !target) return null;
            const focused = selectedId && (edge.source === selectedId || edge.target === selectedId);
            return <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={focused ? "rgba(255,255,255,.92)" : "rgba(132,175,255,.34)"} strokeWidth={focused ? 2.5 : 1.2} />;
          })}
          {!showRecords && clusters.map((cluster, index) => {
            const clusterCenter = pointOnRing(index, clusters.length, MAP_CENTER, 250);
            const color = `var(${NODE_TYPE_COLOR_VAR[cluster.type]})`;
            const focusCluster = () => { const targetZoom = 1.65; onSelect(null); setFocusedType(cluster.type); setZoom(targetZoom); setPan({ x: 70 - targetZoom * 170, y: 100 - targetZoom * 120 }); };
            return (
              <g key={cluster.type} role="button" tabIndex={0} aria-label={`Zoom into ${NODE_TYPE_LABEL[cluster.type]}: ${cluster.nodeIds.length} records, ${cluster.explicitEdgeCount} internal explicit connections`} className="cursor-pointer outline-none" onClick={(event) => { event.stopPropagation(); if (suppressClick.current) { suppressClick.current = false; return; } focusCluster(); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); focusCluster(); } }}>
                <circle cx={clusterCenter.x} cy={clusterCenter.y} r={54 + Math.min(cluster.nodeIds.length, 24) * 1.7} fill={color} fillOpacity=".24" stroke={color} strokeWidth="2" />
                <text x={clusterCenter.x} y={clusterCenter.y - 5} textAnchor="middle" fill="white" fontSize="17" fontWeight="700">{NODE_TYPE_LABEL[cluster.type]}</text>
                <text x={clusterCenter.x} y={clusterCenter.y + 18} textAnchor="middle" fill="rgba(255,255,255,.72)" fontSize="13">{cluster.nodeIds.length} records · {cluster.explicitEdgeCount} links</text>
              </g>
            );
          })}
          {showRecords && mapNodes.map((node) => {
            const point = layout.positions.get(node.id);
            if (!point) return null;
            const selected = node.id === selectedId;
            const dim = Boolean(selectedId) && !selected && !neighborIds.has(node.id);
            const color = `var(${NODE_TYPE_COLOR_VAR[node.type]})`;
            const radius = nodeRadius(node, selectedId, neighborIds);
            return (
              <g key={node.id} role="button" tabIndex={0} aria-label={`${node.label}, ${NODE_TYPE_LABEL[node.type]}${node.orphaned ? ", no explicit connections" : ""}`} className="cursor-pointer outline-none" opacity={dim ? 0.28 : 1} onClick={(event) => { event.stopPropagation(); if (suppressClick.current) { suppressClick.current = false; return; } onSelect(node.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(node.id); } }}>
                <circle cx={point.x} cy={point.y} r={radius + 5} fill={color} fillOpacity={selected ? ".35" : ".14"} />
                <circle cx={point.x} cy={point.y} r={radius} fill={color} stroke={selected ? "white" : "rgba(255,255,255,.64)"} strokeWidth={selected ? 2.4 : 1} />
                <text x={point.x + radius + 9} y={point.y + 5} fill="white" fontSize={selected ? "16" : "14"} fontWeight={selected ? "700" : "500"} stroke="#070a12" strokeWidth="4" paintOrder="stroke" pointerEvents="none">{node.label}</text>
                <title>{node.label} · {NODE_TYPE_LABEL[node.type]}</title>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="absolute left-3 top-3 rounded-xl border border-white/10 bg-[#0b1020]/90 px-3 py-2 backdrop-blur-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-white/55">Knowledge map</p>
        <p className="mt-0.5 text-[12px] font-medium text-white">{focusedType ? `${NODE_TYPE_LABEL[focusedType]} · ${focusNodes.length} records` : semanticLevel}</p>
        <p className="mt-0.5 text-[11px] text-white/55">{focusedType ? "Select a record to reveal its explicit links" : `${visibleNodes.length} records · zoom into a category to browse`}</p>
      </div>
      <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-xl border border-white/10 bg-[#0b1020]/90 p-1.5 backdrop-blur-sm">
        <button type="button" onClick={() => updateZoom(-0.16)} aria-label="Zoom out" className="rounded-lg p-2 text-white/75 hover:bg-white/10 hover:text-white"><Minus className="h-4 w-4" /></button>
        <span className="min-w-12 text-center text-[11px] text-white/70">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => updateZoom(0.16)} aria-label="Zoom in" className="rounded-lg p-2 text-white/75 hover:bg-white/10 hover:text-white"><Plus className="h-4 w-4" /></button>
        <button type="button" onClick={reset} aria-label="Reset map view" className="ml-1 rounded-lg p-2 text-white/75 hover:bg-white/10 hover:text-white"><RotateCcw className="h-4 w-4" /></button>
      </div>
      <p className="absolute bottom-4 right-4 text-[10px] text-white/45">Scroll to zoom · drag to pan · select any label</p>
    </div>
  );
}
