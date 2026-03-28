import type {
  PresentationPageRegion,
  PresentationPageRegionNode,
  PresentationFeatureUsage,
  PresentationPageLayout,
} from "@stego-labs/engine";

export function prepareLatexMetadata(
  page: PresentationPageLayout,
  features: PresentationFeatureUsage,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  if (page.geometry.length > 0) {
    metadata.geometry = page.geometry;
  }

  const fontFamily = normalizeFontFamily(page.fontFamily);
  const fontSize = normalizeFontSize(page.fontSize);
  const lineSpacing = normalizeLineSpacing(page.lineSpacing);

  if (fontFamily) {
    metadata.mainfont = fontFamily;
  }
  if (fontSize) {
    metadata.fontsize = fontSize;
  }

  const headerIncludes: string[] = [];
  if (fontFamily || features.usesBlockFontFamily) {
    headerIncludes.push("\\usepackage{fontspec}");
  }
  if (lineSpacing !== undefined || features.usesBlockLineSpacing) {
    headerIncludes.push("\\usepackage{setspace}");
  }
  if (features.usesTextColor) {
    headerIncludes.push("\\usepackage{xcolor}");
  }
  if (features.usesUnderline) {
    headerIncludes.push("\\usepackage[normalem]{ulem}");
  }
  if (lineSpacing !== undefined) {
    headerIncludes.push(`\\setstretch{${lineSpacing}}`);
  }
  if (page.header || page.footer) {
    headerIncludes.push("\\usepackage{fancyhdr}");
    headerIncludes.push("\\pagestyle{fancy}");
    headerIncludes.push("\\fancyhf{}");
    headerIncludes.push(...renderRegion("head", page.header));
    headerIncludes.push(...renderRegion("foot", page.footer));
    headerIncludes.push("\\renewcommand{\\headrulewidth}{0pt}");
    headerIncludes.push("\\renewcommand{\\footrulewidth}{0pt}");
  }

  if (headerIncludes.length > 0) {
    metadata["header-includes"] = headerIncludes;
  }

  return metadata;
}

function normalizeFontFamily(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeFontSize(value: number | `${number}pt` | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  return typeof value === "number" ? `${value}pt` : value.trim();
}

function normalizeLineSpacing(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function renderRegion(kind: "head" | "foot", region: PresentationPageRegion | undefined): string[] {
  if (!region) {
    return [];
  }

  const lines: string[] = [];
  for (const [slot, value] of Object.entries(region) as Array<[keyof PresentationPageRegion, PresentationPageRegion[keyof PresentationPageRegion]]>) {
    if (!value || value.length === 0) {
      continue;
    }
    const latexSlot = slot === "left" ? "L" : slot === "center" ? "C" : "R";
    lines.push(`\\fancy${kind}[${latexSlot}]{${renderRegionInline(value)}}`);
  }
  return lines;
}

function renderRegionInline(nodes: PresentationPageRegionNode[]): string {
  return nodes.map(renderRegionInlineNode).join("");
}

function renderRegionInlineNode(node: PresentationPageRegionNode): string {
  if (node.kind === "text") {
    return escapeLatex(node.value);
  }
  if (node.kind === "pageNumber") {
    return "\\thepage";
  }

  const body = renderRegionInline(node.children);
  const wrappers: string[] = [];
  if (node.fontFamily) {
    wrappers.push(`\\fontspec{${escapeLatex(node.fontFamily)}}`);
  }
  if (node.fontSizePt !== undefined) {
    const baseline = node.fontSizePt * 1.2;
    wrappers.push(`\\fontsize{${node.fontSizePt}pt}{${baseline}pt}\\selectfont`);
  }
  if (node.fontWeight === "bold") {
    wrappers.push("\\bfseries");
  } else if (node.fontWeight === "normal") {
    wrappers.push("\\mdseries");
  }
  if (node.italic === true) {
    wrappers.push("\\itshape");
  } else if (node.italic === false) {
    wrappers.push("\\upshape");
  }
  if (node.smallCaps === true) {
    wrappers.push("\\scshape");
  } else if (node.smallCaps === false) {
    wrappers.push("\\normalfont");
  }
  if (node.color) {
    wrappers.push(`\\color[HTML]{${node.color.replace(/^#/, "")}}`);
  }

  let content = wrappers.length > 0
    ? `{${wrappers.join("")}${body}}`
    : body;

  if (node.underline === true) {
    content = `\\uline{${content}}`;
  }

  return content;
}

function escapeLatex(value: string): string {
  return value.replace(/[\\{}%$#&_]/g, (match) => `\\${match}`);
}
