// ─── Network interaction helpers ──────────────────────────────
// Pure transforms over an already-built graph's edges: who a node's
// direct explicit neighbors are, how its relationships break down by
// type, and a deterministic 2D layout for the mobile neighborhood
// view. No fetching, no inference — only edges that already exist.

import type { NetworkEdge, NetworkNode, NetworkNodeType } from "./network-graph";

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

export interface GridPoint {
  x: number;
  y: number;
}

// A deterministic grid prevents a large category (for example Drive) from
// collapsing hundreds of labels onto one small ring.
export function computeClusterGridLayout(nodeIds: string[], columns: number): Map<string, GridPoint> {
  const safeColumns = Math.max(1, Math.floor(columns));
  const result = new Map<string, GridPoint>();
  [...new Set(nodeIds)].sort().forEach((id, index) => {
    result.set(id, { x: index % safeColumns, y: Math.floor(index / safeColumns) });
  });
  return result;
}

export interface NetworkCluster {
  type: NetworkNodeType;
  nodeIds: string[];
  explicitEdgeCount: number;
}

// Overview-level data only. AI suggestions are deliberately excluded so they
// cannot be mistaken for recorded relationships or change data-health totals.
export function buildNetworkClusters(nodes: NetworkNode[], edges: NetworkEdge[]): NetworkCluster[] {
  const groups = new Map<NetworkNodeType, string[]>();
  for (const node of nodes) {
    const ids = groups.get(node.type) ?? [];
    ids.push(node.id);
    groups.set(node.type, ids);
  }

  return [...groups.entries()]
    .map(([type, nodeIds]) => {
      const memberIds = new Set(nodeIds);
      const explicitEdgeCount = edges.filter(
        (edge) => edge.type !== "ai-suggestion" && memberIds.has(edge.source) && memberIds.has(edge.target)
      ).length;
      return { type, nodeIds: [...nodeIds].sort(), explicitEdgeCount };
    })
    .sort((a, b) => a.type.localeCompare(b.type));
}
