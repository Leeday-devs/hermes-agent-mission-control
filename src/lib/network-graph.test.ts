import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNetworkGraph, computeNetworkHealth } from "./network-graph";

test("empty input yields an empty graph and zeroed health", () => {
  const graph = buildNetworkGraph({});
  assert.deepEqual(graph.nodes, []);
  assert.deepEqual(graph.edges, []);
  const health = computeNetworkHealth(graph);
  assert.deepEqual(health, { totalNodes: 0, totalEdges: 0, orphanedNodes: 0 });
});

test("builds one node per row across all six explicit categories", () => {
  const graph = buildNetworkGraph({
    memory: [{ id: "onboarding", title: "Onboarding", type: "fact", status: "active", links: [], provenance: "wiki", updatedAt: "2026-01-01T00:00:00.000Z" }],
    tasks: [{ id: "t1", title: "Ship report", assignee: null, status: "todo", board: "default", updatedAt: "2026-01-02T00:00:00.000Z" }],
    ideas: [{ id: "i1", title: "New landing page", status: "new", category: "build", timestamp: "2026-01-03T00:00:00.000Z" }],
    clients: [{ id: "c1", clientName: "Acme", projectName: "Website refresh", status: "in_progress", updatedAt: "2026-01-04T00:00:00.000Z" }],
    events: [{ id: "e1", title: "Deploy finished", agent: null, level: "up", createdAt: "2026-01-05T00:00:00.000Z" }],
    requests: [{ id: "r1", title: "Send report", status: "queued", origin: "web", hermesTaskId: null, createdAt: "2026-01-06T00:00:00.000Z" }],
  });

  const byType = Object.fromEntries(graph.nodes.map((n) => [n.type, n]));
  assert.equal(graph.nodes.length, 6);

  assert.deepEqual(byType.memory, {
    id: "memory:onboarding", type: "memory", label: "Onboarding", source: "Hermes Memory",
    status: "active", owner: "wiki", updatedAt: "2026-01-01T00:00:00.000Z", orphaned: true,
  });
  assert.deepEqual(byType.task, {
    id: "task:t1", type: "task", label: "Ship report", source: "Hermes Task",
    status: "todo", owner: null, updatedAt: "2026-01-02T00:00:00.000Z", orphaned: true,
  });
  assert.deepEqual(byType.idea, {
    id: "idea:i1", type: "idea", label: "New landing page", source: "Idea",
    status: "new", owner: "build", updatedAt: "2026-01-03T00:00:00.000Z", orphaned: true,
  });
  assert.deepEqual(byType.client, {
    id: "client:c1", type: "client", label: "Website refresh", source: "Client Project",
    status: "in_progress", owner: "Acme", updatedAt: "2026-01-04T00:00:00.000Z", orphaned: true,
  });
  assert.deepEqual(byType.event, {
    id: "event:e1", type: "event", label: "Deploy finished", source: "Agent Event",
    status: "up", owner: null, updatedAt: "2026-01-05T00:00:00.000Z", orphaned: true,
  });
  assert.deepEqual(byType.request, {
    id: "request:r1", type: "request", label: "Send report", source: "Agent Request",
    status: "queued", owner: "web", updatedAt: "2026-01-06T00:00:00.000Z", orphaned: true,
  });
});

test("memory links only create an edge when the target memory node is present", () => {
  const graph = buildNetworkGraph({
    memory: [
      { id: "a", title: "A", type: "fact", status: "active", links: ["b", "missing"], provenance: null, updatedAt: null },
      { id: "b", title: "B", type: "fact", status: "active", links: [], provenance: null, updatedAt: null },
    ],
  });
  assert.equal(graph.edges.length, 1);
  assert.deepEqual(graph.edges[0], { id: "memory-link:memory:a->memory:b", source: "memory:a", target: "memory:b", type: "memory-link" });
  const a = graph.nodes.find((n) => n.id === "memory:a")!;
  const b = graph.nodes.find((n) => n.id === "memory:b")!;
  assert.equal(a.orphaned, false);
  assert.equal(b.orphaned, false);
});

test("a memory entry that links to itself does not create a self-loop", () => {
  const graph = buildNetworkGraph({
    memory: [{ id: "a", title: "A", type: "fact", status: "active", links: ["a"], provenance: null, updatedAt: null }],
  });
  assert.equal(graph.edges.length, 0);
  assert.equal(graph.nodes[0].orphaned, true);
});

test("hermes task assignee produces exactly one agent node and an assigned-to edge, deduped across tasks", () => {
  const graph = buildNetworkGraph({
    tasks: [
      { id: "t1", title: "Task one", assignee: "Sage", status: "todo", board: "default", updatedAt: null },
      { id: "t2", title: "Task two", assignee: "Sage", status: "doing", board: "default", updatedAt: null },
    ],
  });
  const agents = graph.nodes.filter((n) => n.type === "agent");
  assert.equal(agents.length, 1);
  assert.deepEqual(agents[0], { id: "agent:Sage", type: "agent", label: "Sage", source: "Agent", status: null, owner: null, updatedAt: null, orphaned: false });
  assert.equal(graph.edges.length, 2);
  assert.ok(graph.edges.every((e) => e.type === "assigned-to" && e.target === "agent:Sage"));
});

test("agent event with an agent field reuses the same agent node created by a task assignee", () => {
  const graph = buildNetworkGraph({
    tasks: [{ id: "t1", title: "Task", assignee: "Sage", status: "todo", board: "default", updatedAt: null }],
    events: [{ id: "e1", title: "Ran a job", agent: "Sage", level: "info", createdAt: null }],
  });
  const agents = graph.nodes.filter((n) => n.type === "agent");
  assert.equal(agents.length, 1);
  const edgeTypes = graph.edges.map((e) => e.type).sort();
  assert.deepEqual(edgeTypes, ["assigned-to", "event-agent"]);
});

test("no agent nodes are synthesized when nothing explicitly references an agent", () => {
  const graph = buildNetworkGraph({
    tasks: [{ id: "t1", title: "Task", assignee: null, status: "todo", board: "default", updatedAt: null }],
    events: [{ id: "e1", title: "Event", agent: "  ", level: "info", createdAt: null }],
  });
  assert.equal(graph.nodes.filter((n) => n.type === "agent").length, 0);
});

test("AgentRequest.hermesTaskId links to the HermesTask id only when that task is present", () => {
  const graph = buildNetworkGraph({
    tasks: [{ id: "t1", title: "Task", assignee: null, status: "todo", board: "default", updatedAt: null }],
    requests: [
      { id: "r1", title: "Linked", status: "done", origin: "hermes", hermesTaskId: "t1", createdAt: null },
      { id: "r2", title: "Dangling", status: "done", origin: "hermes", hermesTaskId: "does-not-exist", createdAt: null },
    ],
  });
  assert.equal(graph.edges.length, 1);
  assert.deepEqual(graph.edges[0], { id: "request-task:request:r1->task:t1", source: "request:r1", target: "task:t1", type: "request-task" });
  const r2 = graph.nodes.find((n) => n.id === "request:r2")!;
  assert.equal(r2.orphaned, true);
});

test("ideas and client projects have no explicit link fields and are always orphaned", () => {
  const graph = buildNetworkGraph({
    ideas: [{ id: "i1", title: "Idea", status: "new", category: "build", timestamp: null }],
    clients: [{ id: "c1", clientName: "Acme", projectName: "Site", status: "in_progress", updatedAt: null }],
  });
  assert.ok(graph.nodes.every((n) => n.orphaned === true));
  assert.equal(graph.edges.length, 0);
});

test("computeNetworkHealth counts totals and orphans from a mixed graph", () => {
  const graph = buildNetworkGraph({
    tasks: [{ id: "t1", title: "Task", assignee: "Sage", status: "todo", board: "default", updatedAt: null }],
    ideas: [{ id: "i1", title: "Idea", status: "new", category: null, timestamp: null }],
  });
  const health = computeNetworkHealth(graph);
  // nodes: task:t1, agent:Sage, idea:i1 = 3; edges: 1 (assigned-to); orphans: idea:i1 = 1
  assert.deepEqual(health, { totalNodes: 3, totalEdges: 1, orphanedNodes: 1 });
});

test("never leaks private fields (meta/prompt/result/error/body) that a caller accidentally attaches to a row", () => {
  const graph = buildNetworkGraph({
    memory: [{ id: "a", title: "A", type: "fact", status: "active", links: [], provenance: null, updatedAt: null, body: "SECRET_BODY" } as never],
    events: [{ id: "e1", title: "Event", agent: null, level: "info", createdAt: null, meta: { token: "SECRET_META" } } as never],
    requests: [{ id: "r1", title: "Req", status: "queued", origin: "web", hermesTaskId: null, createdAt: null, prompt: "SECRET_PROMPT", result: "SECRET_RESULT", error: "SECRET_ERROR" } as never],
  });
  const serialized = JSON.stringify(graph);
  for (const secret of ["SECRET_BODY", "SECRET_META", "SECRET_PROMPT", "SECRET_RESULT", "SECRET_ERROR"]) {
    assert.ok(!serialized.includes(secret), `expected ${secret} to be absent from graph output`);
  }
});
