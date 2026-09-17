// ─── Network graph builder ────────────────────────────────────
// Pure transform: DB rows in, a typed node/edge graph out. No
// network/db access here — keeps /api/network testable and keeps
// the "only explicit, recorded relationships" rule enforceable in
// one place. Only the fields listed on each Raw*Row type are read;
// anything else a caller attaches to a row (meta, prompt, result,
// error, body, ...) is never copied onto the output nodes.

export type NetworkNodeType =
  | "memory"
  | "task"
  | "idea"
  | "client"
  | "agent"
  | "event"
  | "request"
  | "drive";

export interface NetworkNode {
  id: string;
  type: NetworkNodeType;
  label: string;
  source: string;
  status: string | null;
  owner: string | null;
  updatedAt: string | null;
  orphaned: boolean;
  // Only set for "drive" nodes — where a viewer can safely open the item.
  // Never a credential, content, or sharing-metadata field.
  webViewLink?: string | null;
}

export interface NetworkEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

export interface NetworkHealth {
  totalNodes: number;
  totalEdges: number;
  orphanedNodes: number;
}

export interface RawMemoryRow {
  id: string;
  title: string;
  type: string;
  status: string | null;
  links: string[];
  provenance: string | null;
  updatedAt: Date | string | null;
}

export interface RawTaskRow {
  id: string;
  title: string;
  assignee: string | null;
  status: string | null;
  board: string;
  updatedAt: Date | string | null;
}

export interface RawIdeaRow {
  id: string;
  title: string;
  status: string | null;
  category: string | null;
  timestamp: Date | string | null;
}

export interface RawClientRow {
  id: string;
  clientName: string;
  projectName: string;
  status: string | null;
  updatedAt: Date | string | null;
}

export interface RawEventRow {
  id: string;
  title: string;
  agent: string | null;
  level: string | null;
  createdAt: Date | string | null;
}

export interface RawRequestRow {
  id: string;
  title: string;
  status: string | null;
  origin: string | null;
  hermesTaskId: string | null;
  createdAt: Date | string | null;
}

// One row per Drive file/folder within the curated root's descendant tree.
// parentId is that item's actual Drive parent id — never inferred, and only
// ever the single primary parent within the curated subtree.
export interface RawDriveRow {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: Date | string | null;
  parentId: string | null;
  webViewLink: string | null;
}

export interface NetworkGraphInput {
  memory?: RawMemoryRow[];
  tasks?: RawTaskRow[];
  ideas?: RawIdeaRow[];
  clients?: RawClientRow[];
  events?: RawEventRow[];
  requests?: RawRequestRow[];
  drive?: RawDriveRow[];
}

const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanOwner(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildNetworkGraph(input: NetworkGraphInput): NetworkGraph {
  const {
    memory = [],
    tasks = [],
    ideas = [],
    clients = [],
    events = [],
    requests = [],
    drive = [],
  } = input;

  const nodes = new Map<string, NetworkNode>();
  const degree = new Map<string, number>();
  const edges: NetworkEdge[] = [];
  const edgeIds = new Set<string>();

  const addNode = (node: NetworkNode) => {
    nodes.set(node.id, node);
    degree.set(node.id, 0);
  };

  const addEdge = (source: string, target: string, type: string) => {
    if (!nodes.has(source) || !nodes.has(target)) return;
    const id = `${type}:${source}->${target}`;
    if (edgeIds.has(id)) return;
    edgeIds.add(id);
    edges.push({ id, source, target, type });
    degree.set(source, (degree.get(source) ?? 0) + 1);
    degree.set(target, (degree.get(target) ?? 0) + 1);
  };

  for (const m of memory) {
    addNode({
      id: `memory:${m.id}`,
      type: "memory",
      label: m.title,
      source: "Hermes Memory",
      status: m.status ?? null,
      owner: cleanOwner(m.provenance),
      updatedAt: iso(m.updatedAt),
      orphaned: false,
    });
  }
  for (const t of tasks) {
    addNode({
      id: `task:${t.id}`,
      type: "task",
      label: t.title,
      source: "Hermes Task",
      status: t.status ?? null,
      owner: cleanOwner(t.assignee),
      updatedAt: iso(t.updatedAt),
      orphaned: false,
    });
  }
  for (const i of ideas) {
    addNode({
      id: `idea:${i.id}`,
      type: "idea",
      label: i.title,
      source: "Idea",
      status: i.status ?? null,
      owner: cleanOwner(i.category),
      updatedAt: iso(i.timestamp),
      orphaned: false,
    });
  }
  for (const c of clients) {
    addNode({
      id: `client:${c.id}`,
      type: "client",
      label: c.projectName,
      source: "Client Project",
      status: c.status ?? null,
      owner: cleanOwner(c.clientName),
      updatedAt: iso(c.updatedAt),
      orphaned: false,
    });
  }
  for (const e of events) {
    addNode({
      id: `event:${e.id}`,
      type: "event",
      label: e.title,
      source: "Agent Event",
      status: e.level ?? null,
      owner: cleanOwner(e.agent),
      updatedAt: iso(e.createdAt),
      orphaned: false,
    });
  }
  for (const r of requests) {
    addNode({
      id: `request:${r.id}`,
      type: "request",
      label: r.title,
      source: "Agent Request",
      status: r.status ?? null,
      owner: cleanOwner(r.origin),
      updatedAt: iso(r.createdAt),
      orphaned: false,
    });
  }

  for (const d of drive) {
    addNode({
      id: `drive:${d.id}`,
      type: "drive",
      label: d.name,
      source: "Google Drive",
      status: d.mimeType === DRIVE_FOLDER_MIME_TYPE ? "folder" : "file",
      owner: null,
      updatedAt: iso(d.modifiedTime),
      orphaned: false,
      webViewLink: d.webViewLink ?? null,
    });
  }

  // Agent nodes are synthesized only from explicit references
  // (task assignee, event agent) — never invented.
  const agentNames = new Set<string>();
  for (const t of tasks) {
    const a = cleanOwner(t.assignee);
    if (a) agentNames.add(a);
  }
  for (const e of events) {
    const a = cleanOwner(e.agent);
    if (a) agentNames.add(a);
  }
  for (const name of agentNames) {
    addNode({
      id: `agent:${name}`,
      type: "agent",
      label: name,
      source: "Agent",
      status: null,
      owner: null,
      updatedAt: null,
      orphaned: false,
    });
  }

  // ── Explicit, recorded relationships only ──
  for (const m of memory) {
    const sourceId = `memory:${m.id}`;
    for (const link of m.links ?? []) {
      const targetId = `memory:${link}`;
      if (targetId === sourceId) continue;
      addEdge(sourceId, targetId, "memory-link");
    }
  }
  for (const t of tasks) {
    const a = cleanOwner(t.assignee);
    if (a) addEdge(`task:${t.id}`, `agent:${a}`, "assigned-to");
  }
  for (const e of events) {
    const a = cleanOwner(e.agent);
    if (a) addEdge(`event:${e.id}`, `agent:${a}`, "event-agent");
  }
  for (const r of requests) {
    if (r.hermesTaskId) addEdge(`request:${r.id}`, `task:${r.hermesTaskId}`, "request-task");
  }
  for (const d of drive) {
    if (d.parentId) addEdge(`drive:${d.id}`, `drive:${d.parentId}`, "drive-parent");
  }

  for (const node of nodes.values()) {
    node.orphaned = (degree.get(node.id) ?? 0) === 0;
  }

  return { nodes: [...nodes.values()], edges };
}

export function computeNetworkHealth(graph: NetworkGraph): NetworkHealth {
  return {
    totalNodes: graph.nodes.length,
    totalEdges: graph.edges.length,
    orphanedNodes: graph.nodes.filter((n) => n.orphaned).length,
  };
}
