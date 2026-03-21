import type { PageRegionSpec } from "../../../../ir/index.ts";
import type { NormalizedPageLayout } from "../../normalize/index.ts";

export function buildLatexMetadata(
  layout: NormalizedPageLayout,
  options: {
    usesBlockFontFamily?: boolean;
    usesBlockLineSpacing?: boolean;
    usesBlockUnderline?: boolean;
    usesBlockTextColor?: boolean;
  } = {}
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  if (layout.geometry.length > 0) {
    metadata.geometry = layout.geometry;
  }
  const fontFamily = normalizeFontFamily(layout.fontFamily);
  const fontSize = normalizeFontSize(layout.fontSize);
  const lineSpacing = normalizeLineSpacing(layout.lineSpacing);
  if (fontFamily) {
    metadata.mainfont = fontFamily;
  }
  if (fontSize) {
    metadata.fontsize = fontSize;
  }

  const headerIncludes: string[] = [];
  if (fontFamily || options.usesBlockFontFamily) {
    headerIncludes.push("\\usepackage{fontspec}");
  }
  if (lineSpacing !== undefined || options.usesBlockLineSpacing) {
    headerIncludes.push("\\usepackage{setspace}");
  }
  if (options.usesBlockTextColor) {
    headerIncludes.push("\\usepackage{xcolor}");
  }
  if (options.usesBlockUnderline) {
    headerIncludes.push("\\usepackage[normalem]{ulem}");
  }
  if (lineSpacing !== undefined) {
    headerIncludes.push(`\\setstretch{${lineSpacing}}`);
  }
  if (layout.header || layout.footer) {
    headerIncludes.push("\\usepackage{fancyhdr}");
    headerIncludes.push("\\pagestyle{fancy}");
    headerIncludes.push("\\fancyhf{}");
    headerIncludes.push(...renderRegion("head", layout.header));
    headerIncludes.push(...renderRegion("foot", layout.footer));
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

function renderRegion(kind: "head" | "foot", region: PageRegionSpec | undefined): string[] {
  if (!region) {
    return [];
  }

  const lines: string[] = [];
  for (const [slot, value] of Object.entries(region) as Array<[keyof PageRegionSpec, PageRegionSpec[keyof PageRegionSpec]]>) {
    if (!value) {
      continue;
    }
    if (value.kind !== "pageNumber") {
      throw new Error(`Only <Stego.PageNumber /> is supported in page template ${kind}.${slot} for V1.`);
    }
    const latexSlot = slot === "left" ? "L" : slot === "center" ? "C" : "R";
    lines.push(`\\fancy${kind}[${latexSlot}]{\\thepage}`);
  }
  return lines;
}
