import { createTextNode, type StegoInlineNode, type StegoNode } from "../../ir/index.ts";

export function normalizeChildren(input: unknown): StegoNode[] {
  const nodes: StegoNode[] = [];
  appendChildren(nodes, input);
  return nodes;
}

export function normalizeInlineChildren(input: unknown): StegoInlineNode[] {
  const nodes = normalizeChildren(input);
  for (const node of nodes) {
    if (node.kind !== "text" && node.kind !== "link") {
      throw new Error(`Only inline children are supported here in V1. Received '${node.kind}'.`);
    }
  }
  return nodes as StegoInlineNode[];
}

function appendChildren(nodes: StegoNode[], input: unknown): void {
  if (input == null || typeof input === "boolean") {
    return;
  }

  if (Array.isArray(input)) {
    for (const entry of input) {
      appendChildren(nodes, entry);
    }
    return;
  }

  if (typeof input === "string" || typeof input === "number") {
    nodes.push(createTextNode(String(input)));
    return;
  }

  if (isStegoNode(input)) {
    nodes.push(input);
    return;
  }

  throw new Error(`Unsupported template child value: ${String(input)}`);
}

function isStegoNode(value: unknown): value is StegoNode {
  return typeof value === "object"
    && value !== null
    && "kind" in value
    && typeof (value as { kind?: unknown }).kind === "string";
}
