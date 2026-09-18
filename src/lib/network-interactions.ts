// ─── Network interaction helpers ──────────────────────────────
// Pure transforms over an already-built graph's edges: who a node's
// direct explicit neighbors are, how its relationships break down by
// type, and a deterministic 2D layout for the mobile neighborhood
// view. No fetching, no inference — only edges that already exist.

import type { NetworkEdge } from "./network-graph";

export interface DirectNeighbor {
  edge: NetworkEdge;
  neighborId: string;
  direction: "outgoing" | "incoming";
}

export function getDirectNeighbors(edges: NetworkEdge[], nodeId: string): DirectNeighbor[] {
  const result: DirectNeighbor[] = [];
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    if (edge.source === nodeId) {
      result.push({ edge, neighborId: edge.target, direction: "outgoing" });
    } else if (edge.target === nodeId) {
      result.push({ edge, neighborId: edge.source, direction: "incoming" });
    }
  }
  return result;
}

export function uniqueDirectNeighbors(edges: NetworkEdge[], nodeId: string): DirectNeighbor[] {
  const seen = new Set<string>();
  return getDirectNeighbors(edges, nodeId)
    .filter((neighbor) => {
      if (seen.has(neighbor.neighborId)) return false;
      seen.add(neighbor.neighborId);
      return true;
    })
    .sort((a, b) => a.neighborId.localeCompare(b.neighborId));
}

export function describeNeighborRelationships(edges: NetworkEdge[], nodeId: string, neighborId: string): string[] {
  return getDirectNeighbors(edges, nodeId)
    .filter((neighbor) => neighbor.neighborId === neighborId)
    .map((neighbor) => `${neighbor.direction} ${neighbor.edge.type}`)
    .sort();
}

export interface RelationshipGroup {
  type: string;
  count: number;
  neighbors: DirectNeighbor[];
}

export function summarizeRelationships(edges: NetworkEdge[], nodeId: string): RelationshipGroup[] {
  const byType = new Map<string, DirectNeighbor[]>();
  for (const n of getDirectNeighbors(edges, nodeId)) {
    const list = byType.get(n.edge.type) ?? [];
    list.push(n);
    byType.set(n.edge.type, list);
  }
  return [...byType.entries()]
    .map(([type, neighbors]) => ({ type, count: neighbors.length, neighbors }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

export interface FocusStats {
  connectionCount: number;
  neighborCount: number;
  relationshipTypeCount: number;
}

export function computeFocusStats(edges: NetworkEdge[], nodeId: string): FocusStats {
  const neighbors = getDirectNeighbors(edges, nodeId);
  return {
    connectionCount: neighbors.length,
    neighborCount: new Set(neighbors.map((n) => n.neighborId)).size,
    relationshipTypeCount: new Set(neighbors.map((n) => n.edge.type)).size,
  };
}

export interface RadialPoint {
  x: number;
  y: number;
}

// Center at the origin, neighbors evenly spaced on a unit circle
// starting at the top, sorted alphabetically for a stable layout
// across re-renders.
export function computeRadialLayout(centerId: string, neighborIds: string[]): Map<string, RadialPoint> {
  const map = new Map<string, RadialPoint>();
  map.set(centerId, { x: 0, y: 0 });
  const sorted = [...new Set(neighborIds)].filter((id) => id !== centerId).sort();
  const n = sorted.length;
  sorted.forEach((id, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    map.set(id, { x: Math.cos(angle), y: Math.sin(angle) });
  });
  return map;
}
