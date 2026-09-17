import type { NetworkNodeType } from "@/lib/network-graph";

export const NODE_TYPES: NetworkNodeType[] = [
  "memory",
  "task",
  "idea",
  "client",
  "agent",
  "event",
  "request",
];

export const NODE_TYPE_COLOR_VAR: Record<NetworkNodeType, string> = {
  memory: "--net-memory",
  task: "--net-task",
  idea: "--net-idea",
  agent: "--net-agent",
  client: "--net-client",
  event: "--net-event",
  request: "--net-request",
};

export const NODE_TYPE_LABEL: Record<NetworkNodeType, string> = {
  memory: "Hermes Memory",
  task: "Hermes Task",
  idea: "Idea",
  client: "Client Project",
  agent: "Agent",
  event: "Agent Event",
  request: "Agent Request",
};

// Where "available actions" in the inspector should navigate — the
// closest existing page for that record's source table. There is no
// dedicated per-item page for these yet, so this links to the relevant
// section rather than inventing a destination.
export const NODE_TYPE_LINK: Record<NetworkNodeType, string> = {
  memory: "/hermes",
  task: "/hermes",
  agent: "/hermes",
  event: "/hermes",
  request: "/hermes",
  idea: "/ideas",
  client: "/clients",
};

export const NODE_TYPE_LINK_LABEL: Record<NetworkNodeType, string> = {
  memory: "Open Hermes",
  task: "Open Hermes",
  agent: "Open Hermes",
  event: "Open Hermes",
  request: "Open Hermes",
  idea: "Open Idea Board",
  client: "Open Client Board",
};
