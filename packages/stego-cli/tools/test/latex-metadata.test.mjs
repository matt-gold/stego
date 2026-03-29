import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..", "..");
const { prepareLatexMetadata } = await import(
  pathToFileURL(path.join(packageRoot, "src", "modules", "export", "infra", "pandoc-presentation", "prepare-latex-metadata.ts")).href
);

test("latex metadata renders styled page-template regions and required packages", () => {
  const metadata = prepareLatexMetadata(
    {
      geometry: ["paper=letterpaper", "margin=1in"],
      fontFamily: "Times New Roman",
      fontSize: "12pt",
      lineSpacing: 2,
    },
    [{
      markerId: "stego-layout-7",
      header: {
        left: [{ kind: "text", value: "Funny Business" }],
        right: [{ kind: "text", value: "Page " }, { kind: "pageNumber" }],
      },
      footer: {
        center: [{
          kind: "span",
          italic: true,
          underline: true,
          color: "#666666",
          children: [{ kind: "text", value: "Draft" }],
        }],
      },
    }],
    {
      usesBlockFontFamily: false,
      usesBlockLineSpacing: false,
      usesUnderline: true,
      usesTextColor: true,
      requiresNamedFontEngine: true,
    },
  );

  assert.deepEqual(metadata.geometry, ["paper=letterpaper", "margin=1in"]);
  assert.equal(metadata.mainfont, "Times New Roman");
  assert.equal(metadata.fontsize, "12pt");

  const headerIncludes = metadata["header-includes"];
  assert.equal(Array.isArray(headerIncludes), true);
  assert.ok(headerIncludes.includes("\\usepackage{fontspec}"));
  assert.ok(headerIncludes.includes("\\usepackage{setspace}"));
  assert.ok(headerIncludes.includes("\\usepackage{xcolor}"));
  assert.ok(headerIncludes.includes("\\usepackage[normalem]{ulem}"));
  assert.ok(headerIncludes.includes("\\setstretch{2}"));
  assert.ok(
    headerIncludes.some((value) => value.includes("\\fancypagestyle{stegopagetemplatestegolayout7}{")),
    JSON.stringify(headerIncludes, null, 2),
  );
  assert.ok(headerIncludes.includes("\\pagestyle{stegopagetemplatenone}"));
  assert.ok(headerIncludes.includes("\\thispagestyle{stegopagetemplatenone}"));
  assert.ok(
    headerIncludes.some((value) => value.includes("\\fancyhead[L]{Funny Business}")),
    JSON.stringify(headerIncludes, null, 2),
  );
  assert.ok(
    headerIncludes.some((value) => value.includes("\\fancyhead[R]{Page \\thepage}")),
    JSON.stringify(headerIncludes, null, 2),
  );
  assert.ok(
    headerIncludes.some((value) => /\\fancyfoot\[C\]\{.*\\uline\{\{\\itshape\\color\[HTML\]\{666666\}Draft\}\}\}/.test(value)),
    JSON.stringify(headerIncludes, null, 2),
  );
});
