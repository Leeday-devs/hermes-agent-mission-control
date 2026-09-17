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
import type { NetworkEdge, NetworkNode, NetworkNodeType } from "@/lib/network-graph";
import { NODE_TYPE_COLOR_VAR } from "./constants";

type Vec3 = { x: number; y: number; z: number };

function fibonacciSphere(ids: string[]): Map<string, Vec3> {
  const sorted = [...ids].sort();
  const n = sorted.length;
  const map = new Map<string, Vec3>();
  if (n === 0) return map;
  const offset = 2 / n;
  const increment = Math.PI * (3 - Math.sqrt(5));
  sorted.forEach((id, i) => {
    const y = i * offset - 1 + offset / 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * increment;
    map.set(id, { x: Math.cos(phi) * r, y, z: Math.sin(phi) * r });
  });
  return map;
}

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
  const rotation = useRef({ y: 0.4, x: -0.3 });
  const dragging = useRef<{ startX: number; startY: number; rotY: number; rotX: number; moved: boolean } | null>(null);
  const hitPoints = useRef<{ id: string; sx: number; sy: number; r: number }[]>([]);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [size, setSize] = useState({ w: 640, h: 500 });

  const nodeIds = useMemo(() => nodes.map((n) => n.id), [nodes]);
  const idsKey = nodeIds.slice().sort().join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => fibonacciSphere(nodeIds), [idsKey]);

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
      if (!reducedMotion && !dragging.current) rotation.current.y += 0.0016;
      ctx.clearRect(0, 0, size.w, size.h);

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

      for (const edge of edges) {
        if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
        const a = layout.get(edge.source);
        const b = layout.get(edge.target);
        if (!a || !b) continue;
        const dim = !!selectedId && edge.source !== selectedId && edge.target !== selectedId;
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

      const hits: { id: string; sx: number; sy: number; r: number }[] = [];
      for (const { node, sx, sy, scale, z } of projected) {
        const depth = (z + 1) / 2;
        const isSelected = node.id === selectedId;
        const isNeighbor = neighborIds.has(node.id);
        const dim = !!selectedId && !isSelected && !isNeighbor;
        const baseR = (isSelected ? 6.5 : 4.5) * Math.max(0.55, scale);
        ctx.beginPath();
        ctx.arc(sx, sy, baseR, 0, Math.PI * 2);
        ctx.fillStyle = dim ? "rgba(255,255,255,0.18)" : (colorCache.get(node.type) ?? "#6ea8fe");
        ctx.globalAlpha = dim ? 0.35 : 0.35 + depth * 0.65;
        ctx.fill();
        if (isSelected) {
          ctx.globalAlpha = 1;
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "rgba(255,255,255,0.85)";
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        hits.push({ id: node.id, sx, sy, r: Math.max(baseR, 9) });
      }
      hitPoints.current = hits;

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size, edges, nodes, layout, visibleIds, selectedId, neighborIds, reducedMotion]);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = { startX: e.clientX, startY: e.clientY, rotY: rotation.current.y, rotX: rotation.current.x, moved: false };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragging.current.startX;
    const dy = e.clientY - dragging.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragging.current.moved = true;
    rotation.current.y = dragging.current.rotY + dx * 0.006;
    rotation.current.x = Math.max(-1.1, Math.min(1.1, dragging.current.rotX + dy * 0.006));
  };
  const endDrag = (e: React.PointerEvent) => {
    const wasDrag = dragging.current?.moved;
    dragging.current = null;
    if (!wasDrag) onSelect(pointerToNode(e.clientX, e.clientY));
  };

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[420px]">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={() => { dragging.current = null; }}
        role="img"
        aria-label="Interactive 3D network globe. Drag to rotate, click a node to inspect it. Use the node list for keyboard navigation."
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
      />
    </div>
  );
}
