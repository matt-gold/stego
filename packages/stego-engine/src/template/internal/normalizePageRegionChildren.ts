import { createTextNode, type StegoNode, type StegoPageRegionInlineNode } from "../../ir/index.ts";

export function normalizePageRegionChildren(input: unknown): StegoPageRegionInlineNode[] {
  const nodes: StegoPageRegionInlineNode[] = [];
  appendPageRegionChildren(nodes, input, { allowPageNumber: true });
  return nodes;
}

function appendPageRegionChildren(
  nodes: StegoPageRegionInlineNode[],
  input: unknown,
  options: { allowPageNumber: boolean },
): void {
  if (input == null || typeof input === "boolean") {
    return;
  }

  if (Array.isArray(input)) {
    for (const entry of input) {
      appendPageRegionChildren(nodes, entry, options);
    }
    return;
  }

  if (typeof input === "string" || typeof input === "number") {
    nodes.push(createTextNode(String(input)));
    return;
  }

  if (isStegoNode(input)) {
    if (input.kind === "fragment") {
      appendPageRegionChildren(nodes, input.children, options);
      return;
    }
    if (input.kind === "text" || input.kind === "span") {
      nodes.push(input);
      return;
    }
    if (input.kind === "pageNumber") {
      if (!options.allowPageNumber) {
        throw new Error("<Stego.PageNumber /> may not appear inside <Stego.Span /> in <Stego.PageTemplate />.");
      }
      nodes.push(input);
      return;
    }

    throw new Error(
      `<Stego.PageTemplate /> regions only support text, <Stego.Span />, fragments, and <Stego.PageNumber /> in V1. Received '${input.kind}'.`,
    );
  }

  throw new Error(`Unsupported page template child value: ${String(input)}`);
}

function isStegoNode(value: unknown): value is StegoNode {
  return typeof value === "object"
    && value !== null
    && "kind" in value
    && typeof (value as { kind?: unknown }).kind === "string";
}
