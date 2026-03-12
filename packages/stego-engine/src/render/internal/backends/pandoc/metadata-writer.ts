import type { PageRegionSpec } from "../../../../ir/index.ts";
import type { NormalizedPageLayout } from "../../normalize/index.ts";

export function buildPandocMetadata(layout: NormalizedPageLayout): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  if (layout.geometry.length > 0) {
    metadata.geometry = layout.geometry;
  }

  const headerIncludes: string[] = [];
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
