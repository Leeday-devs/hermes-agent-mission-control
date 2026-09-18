"use client";

/* ───────────────────────────────────────────────────────────
   Hermy HQ · Network globe
   A dark, cinematic knowledge sphere: nodes are laid out on a
   Fibonacci sphere (stable, deterministic — no physics jitter)
   and explicit connections are drawn as great-circle arcs that
   wrap along the surface. Canvas 2D only, no 3D dependency.
   Desktop-only — see page.tsx for the mobile 2D fallback.
   ─────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, RotateCcw } from "lucide-react";
import type { NetworkEdge, NetworkNode, NetworkNodeType } from "@/lib/network-graph";
import { fibonacciSphereLayout, generateStarfield, rotationToFace, type Vec3 } from "@/lib/network-sphere";
import { computeFocusStats } from "@/lib/network-interactions";
import { NODE_TYPE_COLOR_VAR, NODE_TYPE_LABEL } from "./constants";

const DEFAULT_ROTATION = { y: 0.4, x: -0.3 };
const STARFIELD = generateStarfield(140, 42);
type HoveredNode = { node: NetworkNode; x: number; y: number } | null;

function rotateY(v: Vec3, a: number): Vec3 {
  const cos = Math.cos(a), sin = Math.sin(a);
  return { x: v.x * cos + v.z * sin, y: v.y, z: -v.x * sin + v.z * cos };
}
function rotateX(v: Vec3, a: number): Vec3 {
  const cos = Math.cos(a), sin = Math.sin(a);
  return { x: v.x, y: v.y * cos - v.z * sin, z: v.y * sin + v.z * cos };
}
function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  const theta = Math.acos(dot);
  if (theta < 1e-6) return a;
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;
  return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb, z: a.z * wa + b.z * wb };
}

export interface NetworkGlobeProps {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  visibleIds: Set<string>;
  selectedId: string | null;
  neighborIds: Set<string>;
  onSelect: (id: string | null) => void;
}

export function NetworkGlobe({ nodes, edges, visibleIds, selectedId, neighborIds, onSelect }: NetworkGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rotation = useRef({ ...DEFAULT_ROTATION });
  const focusAnim = useRef<{ fromY: number; fromX: number; toY: number; toX: number; start: number; duration: number } | null>(null);
  const dragging = useRef<{ startX: number; startY: number; rotY: number; rotX: number; moved: boolean } | null>(null);
  const hovering = useRef(false);
  const hitPoints = useRef<{ id: string; sx: number; sy: number; r: number; z: number }[]>([]);
  const [hovered, setHovered] = useState<HoveredNode>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [size, setSize] = useState({ w: 640, h: 500 });

  const nodeIds = useMemo(() => nodes.map((n) => n.id), [nodes]);
  const idsKey = nodeIds.slice().sort().join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => fibonacciSphereLayout(nodeIds), [idsKey]);

  const visibleNodes = useMemo(() => nodes.filter((n) => visibleIds.has(n.id)), [nodes, visibleIds]);
  const visibleEdges = useMemo(
    () => edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target) && edge.type !== "ai-suggestion"),
    [edges, visibleIds]
  );
  const visibleEdgeCount = visibleEdges.length;
  const orphanCount = useMemo(() => visibleNodes.filter((n) => n.orphaned).length, [visibleNodes]);
  const legendTypes = useMemo(
    () => [...new Set(visibleNodes.map((n) => n.type))].sort(),
    [visibleNodes]
  );
  const focusStats = useMemo(
    () => (selectedId ? computeFocusStats(visibleEdges, selectedId) : null),
    [visibleEdges, selectedId]
  );
  const selectedNode = useMemo(
    () => (selectedId ? nodes.find((node) => node.id === selectedId) ?? null : null),
    [nodes, selectedId]
  );

  const animateRotationTo = useCallback(
    (target: { y: number; x: number }) => {
      focusAnim.current = {
        fromY: rotation.current.y,
        fromX: rotation.current.x,
        toY: target.y,
        toX: target.x,
        start: performance.now(),
        duration: reducedMotion ? 0 : 700,
      };
    },
    [reducedMotion]
  );

  const focusOnSelected = useCallback(() => {
    if (!selectedId) return;
    const pos = layout.get(selectedId);
    if (!pos) return;
    animateRotationTo(rotationToFace(pos));
  }, [selectedId, layout, animateRotationTo]);

  const resetView = useCallback(() => {
    animateRotationTo(DEFAULT_ROTATION);
    onSelect(null);
  }, [animateRotationTo, onSelect]);

  useEffect(() => {
    if (selectedId) focusOnSelected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setSize({ w: Math.max(280, box.width), h: Math.max(320, box.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pointerToNode = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best: { id: string; d: number } | null = null;
    for (const hp of hitPoints.current) {
      if (hp.z <= -0.12) continue;
      const d = Math.hypot(hp.sx - x, hp.sy - y);
      if (d <= hp.r && (!best || d < best.d)) best = { id: hp.id, d };
    }
    return best?.id ?? null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const colorCache = new Map<NetworkNodeType, string>();
    const rootStyle = getComputedStyle(document.documentElement);
    for (const [type, cssVar] of Object.entries(NODE_TYPE_COLOR_VAR) as [NetworkNodeType, string][]) {
      colorCache.set(type, rootStyle.getPropertyValue(cssVar).trim() || "#6ea8fe");
    }

    const cx = size.w / 2;
    const cy = size.h / 2;
    const R = Math.min(size.w, size.h) * 0.36;
    const camera = 2.6;

    const project = (v: Vec3) => {
      const scale = camera / (camera - v.z);
      return { sx: cx + v.x * R * scale, sy: cy + v.y * R * scale, scale };
    };
    const transform = (v: Vec3) => rotateX(rotateY(v, rotation.current.y), rotation.current.x);

    let raf = 0;
    const draw = (time: number) => {
      if (focusAnim.current) {
        const { fromY, fromX, toY, toX, start, duration } = focusAnim.current;
        const t = duration <= 0 ? 1 : Math.min(1, (time - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        rotation.current.y = fromY + (toY - fromY) * eased;
        rotation.current.x = fromX + (toX - fromX) * eased;
        if (t >= 1) focusAnim.current = null;
      } else if (!reducedMotion && !dragging.current && !hovering.current && !selectedId) {
        rotation.current.y += 0.00135;
      }
      ctx.clearRect(0, 0, size.w, size.h);

      for (const star of STARFIELD) {
        ctx.beginPath();
        ctx.arc(star.x * size.w, star.y * size.h, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${star.a * 0.5})`;
        ctx.fill();
      }

      const glow = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.08);
      glow.addColorStop(0, "rgba(110,168,254,0.10)");
      glow.addColorStop(1, "rgba(110,168,254,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      for (const edge of visibleEdges) {
        const a = layout.get(edge.source);
        const b = layout.get(edge.target);
        if (!a || !b) continue;
        const active = edge.source === selectedId || edge.target === selectedId || edge.source === hovered?.node.id || edge.target === hovered?.node.id;
        const dim = Boolean(selectedId || hovered) && !active;
        const steps = 24;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const { sx, sy } = project(transform(slerp(a, b, i / steps)));
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.strokeStyle = dim ? "rgba(255,255,255,0.05)" : "rgba(110,168,254,0.35)";
        ctx.lineWidth = dim ? 0.75 : 1.25;
        ctx.stroke();

        if (!reducedMotion) {
          const seed = (edge.id.charCodeAt(0) + edge.id.length) / 40;
          const t = (((time * 0.00025) + seed) % 1 + 1) % 1;
          const { sx, sy, scale } = project(transform(slerp(a, b, t)));
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(1, 1.6 * scale), 0, Math.PI * 2);
          ctx.fillStyle = dim ? "rgba(255,255,255,0.12)" : "rgba(200,225,255,0.85)";
          ctx.fill();
        }
      }

      const projected = nodes
        .filter((n) => visibleIds.has(n.id))
        .map((n) => {
          const base = layout.get(n.id) ?? { x: 0, y: 0, z: 0 };
          const t = transform(base);
          const p = project(t);
          return { node: n, ...p, z: t.z };
        })
        .sort((a, b) => a.z - b.z);

      const hits: { id: string; sx: number; sy: number; r: number; z: number }[] = [];
      for (const { node, sx, sy, scale, z } of projected) {
        const depth = (z + 1) / 2;
        const isSelected = node.id === selectedId;
        const isHovered = node.id === hovered?.node.id;
        const isNeighbor = neighborIds.has(node.id);
        const dim = Boolean(selectedId || hovered) && !isSelected && !isHovered && !isNeighbor;
        const baseR = (isSelected || isHovered ? 6.5 : 4.5) * Math.max(0.55, scale);
        ctx.beginPath();
        ctx.arc(sx, sy, baseR, 0, Math.PI * 2);
        ctx.fillStyle = dim ? "rgba(255,255,255,0.18)" : (colorCache.get(node.type) ?? "#6ea8fe");
        ctx.shadowBlur = isSelected || isHovered ? 18 : 7;
        ctx.shadowColor = colorCache.get(node.type) ?? "#6ea8fe";
        ctx.globalAlpha = dim ? 0.35 : 0.35 + depth * 0.65;
        ctx.fill();
        ctx.shadowBlur = 0;
        if (isSelected || isHovered) {
          ctx.globalAlpha = 1;
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "rgba(255,255,255,0.85)";
          ctx.stroke();
        }
        if ((isSelected || isHovered || isNeighbor) && z > -0.25) {
          ctx.globalAlpha = isNeighbor && !isSelected && !isHovered ? 0.72 : 1;
          ctx.font = `${isSelected || isHovered ? 600 : 500} 12px Inter, ui-sans-serif, system-ui`;
          ctx.fillStyle = "#f7fbff";
          ctx.strokeStyle = "rgba(4,8,18,.9)";
          ctx.lineWidth = 3.5;
          ctx.strokeText(node.label, sx + baseR + 7, sy + 4);
          ctx.fillText(node.label, sx + baseR + 7, sy + 4);
        }
        if (node.orphaned) {
          ctx.globalAlpha = dim ? 0.25 : 0.55;
          ctx.setLineDash([2, 2]);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(255,255,255,0.5)";
          ctx.beginPath();
          ctx.arc(sx, sy, baseR + 3.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.globalAlpha = 1;
        hits.push({ id: node.id, sx, sy, r: Math.max(baseR, 9), z });
      }
      hitPoints.current = hits;

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size, visibleEdges, nodes, layout, visibleIds, selectedId, neighborIds, reducedMotion, hovered]);

  const updateHover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragging.current) return;
    const id = pointerToNode(e.clientX, e.clientY);
    hovering.current = Boolean(id);
    const node = id ? nodes.find((item) => item.id === id) ?? null : null;
    if (!node) { setHovered(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setHovered({ node, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragging.current = { startX: e.clientX, startY: e.clientY, rotY: rotation.current.y, rotX: rotation.current.x, moved: false };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) { updateHover(e); return; }
    const dx = e.clientX - dragging.current.startX;
    const dy = e.clientY - dragging.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragging.current.moved = true;
    rotation.current.y = dragging.current.rotY + dx * 0.006;
    rotation.current.x = Math.max(-1.1, Math.min(1.1, dragging.current.rotX + dy * 0.006));
  };
  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasDrag = dragging.current?.moved;
    dragging.current = null;
    if (!wasDrag) onSelect(pointerToNode(e.clientX, e.clientY));
  };
  const leaveCanvas = () => { dragging.current = null; hovering.current = false; setHovered(null); };
  const tooltipX = hovered ? Math.min(Math.max(18, hovered.x + 34), Math.max(18, size.w - 250)) : 0;
  const tooltipY = hovered ? Math.min(Math.max(18, hovered.y - 46), Math.max(18, size.h - 140)) : 0;

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[420px]">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={leaveCanvas}
        role="img"
        aria-label="Interactive AI knowledge globe. Drag to orbit, hover a node for details, and click a node to inspect it. Hover pauses rotation."
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
      />
      {hovered && (
        <>
          <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full"><line x1={hovered.x} y1={hovered.y} x2={tooltipX} y2={tooltipY + 52} stroke="rgba(157,238,255,.78)" strokeWidth="1" /></svg>
          <div className="pointer-events-none absolute z-10 w-56 rounded-xl border border-cyan-200/25 bg-[#091120]/95 px-3 py-2.5 shadow-[0_12px_42px_rgba(0,0,0,.45)] backdrop-blur-md" style={{ left: tooltipX, top: tooltipY }}>
            <p className="truncate text-[12px] font-semibold text-white">{hovered.node.label}</p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[.12em] text-cyan-100/65">{NODE_TYPE_LABEL[hovered.node.type]}</p>
            <p className="mt-2 truncate text-[11px] text-white/65">Source · {hovered.node.source}</p>
            {hovered.node.status && <p className="truncate text-[11px] text-white/65">Status · {hovered.node.status}</p>}
            {hovered.node.owner && <p className="truncate text-[11px] text-white/65">Owner · {hovered.node.owner}</p>}
          </div>
        </>
      )}
      <p className="sr-only" aria-live="polite">
        {selectedNode && focusStats
          ? `${selectedNode.label} selected. ${focusStats.neighborCount} direct explicit neighbor${focusStats.neighborCount === 1 ? "" : "s"} and ${focusStats.relationshipTypeCount} relationship type${focusStats.relationshipTypeCount === 1 ? "" : "s"}.`
          : "No network node selected. Use the node list to select a node for details."}
      </p>

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto rounded-xl bg-[rgba(10,13,20,0.55)] backdrop-blur-sm border border-[var(--line)] px-3 py-2.5">
            <div className="flex items-center gap-3 num text-[11px] text-[var(--text-2)]">
              <span>{visibleNodes.length} nodes</span>
              <span>{visibleEdgeCount} links</span>
              <span>{orphanCount} orphaned</span>
            </div>
            {focusStats && (
              <div className="mt-1.5 pt-1.5 border-t border-[var(--line)] text-[11px] text-[var(--text-3)]">
                Focused: {focusStats.neighborCount} neighbor{focusStats.neighborCount === 1 ? "" : "s"} ·{" "}
                {focusStats.relationshipTypeCount} relationship type{focusStats.relationshipTypeCount === 1 ? "" : "s"}
              </div>
            )}
          </div>
          {legendTypes.length > 0 && (
            <div className="pointer-events-auto flex flex-col items-end gap-1">
              {legendTypes.map((t) => (
                <span key={t} className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-3)]">
                  {NODE_TYPE_LABEL[t]}
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: `var(${NODE_TYPE_COLOR_VAR[t]})` }} />
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-2 self-start">
          <button
            type="button"
            onClick={focusOnSelected}
            disabled={!selectedId}
            aria-label="Rotate the globe to face the selected node"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[rgba(10,13,20,0.55)] backdrop-blur-sm border border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <Crosshair className="w-3 h-3" /> Focus selected
          </button>
          <button
            type="button"
            onClick={resetView}
            aria-label="Reset globe rotation and clear the selected node"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-[rgba(10,13,20,0.55)] backdrop-blur-sm border border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)] transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Reset view
          </button>
        </div>
      </div>
    </div>
  );
}
