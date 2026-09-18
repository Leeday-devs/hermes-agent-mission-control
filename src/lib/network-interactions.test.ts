import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getDirectNeighbors,
  uniqueDirectNeighbors,
  describeNeighborRelationships,
  summarizeRelationships,
  computeFocusStats,
  computeRadialLayout,
} from "./network-interactions";
import type { NetworkEdge } from "./network-graph";

const edges: NetworkEdge[] = [
  { id: "e1", source: "a", target: "b", type: "link" },
  { id: "e2", source: "c", target: "a", type: "ref" },
  { id: "e3", source: "a", target: "b", type: "assigned-to" },
  { id: "e4", source: "b", target: "c", type: "link" },
];

test("getDirectNeighbors finds edges touching the node, with direction and the other side's id", () => {
  // node "a" touches e1 (a->b), e2 (c->a), e3 (a->b) — three edges, two of them to "b".
  const result = getDirectNeighbors(edges, "a");
  assert.equal(result.length, 3);
  const toB = result.filter((r) => r.neighborId === "b");
  assert.equal(toB.length, 2);
  assert.ok(toB.every((r) => r.direction === "outgoing"));
  const toC = result.find((r) => r.neighborId === "c")!;
  assert.equal(toC.direction, "incoming");
  assert.equal(toC.edge.id, "e2");
});

test("getDirectNeighbors ignores edges unrelated to the node", () => {
  const result = getDirectNeighbors(edges, "z");
  assert.equal(result.length, 0);
});

test("getDirectNeighbors excludes a self-loop edge", () => {
  const result = getDirectNeighbors([{ id: "self", source: "a", target: "a", type: "x" }], "a");
  assert.equal(result.length, 0);
});

test("uniqueDirectNeighbors returns one deterministic item per neighbor even with multiple explicit edges", () => {
  const neighbors = uniqueDirectNeighbors(edges, "a");
  assert.deepEqual(neighbors.map((n) => [n.neighborId, n.edge.id]), [["b", "e1"], ["c", "e2"]]);
});

test("describeNeighborRelationships preserves all explicit types and directions for a neighbor", () => {
  assert.deepEqual(describeNeighborRelationships(edges, "a", "b"), ["outgoing assigned-to", "outgoing link"]);
  assert.deepEqual(describeNeighborRelationships(edges, "a", "c"), ["incoming ref"]);
});

test("summarizeRelationships groups by edge type, most common first", () => {
  // node "a" has: link->b (e1), ref<-c (e2), assigned-to->b (e3) => two edges to b across two types, one to c
  const groups = summarizeRelationships(edges, "a");
  assert.deepEqual(
    groups.map((g) => [g.type, g.count]),
    [["assigned-to", 1], ["link", 1], ["ref", 1]]
  );
});

test("summarizeRelationships breaks a count tie alphabetically by type", () => {
  const tied: NetworkEdge[] = [
    { id: "e1", source: "a", target: "b", type: "zzz" },
    { id: "e2", source: "a", target: "c", type: "aaa" },
  ];
  const groups = summarizeRelationships(tied, "a");
  assert.deepEqual(groups.map((g) => g.type), ["aaa", "zzz"]);
});

test("computeFocusStats counts connections, unique neighbors, and unique relationship types", () => {
  const stats = computeFocusStats(edges, "a");
  // a: e1 (link->b), e2 (ref<-c), e3 (assigned-to->b) => 3 connections, 2 unique neighbors (b,c), 3 types
  assert.deepEqual(stats, { connectionCount: 3, neighborCount: 2, relationshipTypeCount: 3 });
});

test("computeFocusStats returns zeros for an isolated node", () => {
  const stats = computeFocusStats(edges, "isolated");
  assert.deepEqual(stats, { connectionCount: 0, neighborCount: 0, relationshipTypeCount: 0 });
});

test("computeRadialLayout always places the center at the origin", () => {
  const layout = computeRadialLayout("center", ["b", "c"]);
  assert.deepEqual(layout.get("center"), { x: 0, y: 0 });
});

test("computeRadialLayout spaces neighbors evenly around the center, deterministically ordered", () => {
  const layout = computeRadialLayout("center", ["c", "b"]);
  const b = layout.get("b")!;
  const c = layout.get("c")!;
  // sorted alphabetically: b first (top, angle -90deg), c second (bottom, angle +90deg)
  assert.ok(Math.abs(b.x - 0) < 1e-9 && Math.abs(b.y - -1) < 1e-9);
  assert.ok(Math.abs(c.x - 0) < 1e-9 && Math.abs(c.y - 1) < 1e-9);
});

test("computeRadialLayout dedupes neighbor ids and excludes the center id if present", () => {
  const layout = computeRadialLayout("center", ["b", "b", "center"]);
  assert.equal(layout.size, 2);
});

test("computeRadialLayout with no neighbors returns only the center", () => {
  const layout = computeRadialLayout("center", []);
  assert.equal(layout.size, 1);
});
