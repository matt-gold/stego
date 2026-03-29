import {
  defineTemplate,
  Stego,
  type BranchRecord,
  type LeafRecord,
  type TemplateContext
} from "../template/index.ts";

type ProjectMeta = {
  title: string;
  author?: string;
};

type LeafMeta = {
  id: string;
  chapter?: string;
  chapter_title?: string;
  kind?: "reference" | "chapter";
};

type BranchMeta = {
  label?: string;
};

const legacyTemplate = defineTemplate((ctx: TemplateContext<LeafMeta, BranchMeta, ProjectMeta>) => {
  const firstLeaf = ctx.allLeaves[0];
  const firstBranchLeaf = ctx.content.branches[0]?.leaves[0];
  const chapter = firstLeaf?.metadata.chapter;
  const branchChapter = firstBranchLeaf?.metadata.chapter;
  const branchLabel = ctx.content.branches[0]?.metadata.label;
  const projectTitle = ctx.project.metadata.title;

  return (
    <Stego.Document
      page={{ size: "6x9", margin: "0.75in" }}
      bodyStyle={{
        fontFamily: "Georgia",
        fontSize: "12pt",
        lineSpacing: 1.5,
        spaceBefore: 0,
        spaceAfter: 0,
      }}
    >
      <Stego.PageTemplate footer={{ right: <Stego.PageNumber /> }}>
        <Stego.KeepTogether>
          <Stego.Heading level={1}>{projectTitle}</Stego.Heading>
          <Stego.Paragraph align="center">{chapter ?? branchChapter ?? branchLabel ?? "Untitled"}</Stego.Paragraph>
          <Stego.Spacer lines={2} />
        </Stego.KeepTogether>
        {firstLeaf ? <Stego.Markdown leaf={firstLeaf} /> : null}
      </Stego.PageTemplate>
    </Stego.Document>
  );
});

const printTemplate = defineTemplate(
  { targets: ["docx", "pdf", "latex"] },
  (ctx: TemplateContext<LeafMeta, BranchMeta, ProjectMeta>, PrintStego) => {
    const firstLeaf = ctx.allLeaves[0];

    return (
      <PrintStego.Document
        page={{ size: "letter", margin: "1in" }}
        bodyStyle={{
          fontFamily: "Times New Roman",
          fontSize: "12pt",
          lineSpacing: 2,
          spaceBefore: 0,
          spaceAfter: 0,
        }}
        headingStyle={{ fontWeight: "bold", color: "#333333" }}
        headingStyles={{ 1: { spaceAfter: 18, fontFamily: "Georgia", underline: true } }}
      >
        <PrintStego.PageTemplate
          header={{ left: "Funny Business", center: <PrintStego.Span italic>Draft</PrintStego.Span> }}
          footer={{ right: <>Page <PrintStego.PageNumber /></> }}
        >
          <PrintStego.Section>
            <PrintStego.KeepTogether>
              <PrintStego.Heading level={1} fontWeight="normal" underline={false}>
                {ctx.project.metadata.title}
              </PrintStego.Heading>
              <PrintStego.Spacer lines={2} />
              <PrintStego.Paragraph align="center" firstLineIndent="2em" lineSpacing={1.5}>
                <PrintStego.Span smallCaps>{ctx.project.metadata.author ?? "Anonymous"}</PrintStego.Span>
              </PrintStego.Paragraph>
            </PrintStego.KeepTogether>
            {firstLeaf ? <PrintStego.Markdown leaf={firstLeaf} /> : null}
          </PrintStego.Section>
        </PrintStego.PageTemplate>
      </PrintStego.Document>
    );
  }
);

const allPresentationTargetsTemplate = defineTemplate(
  { targets: ["docx", "pdf", "epub", "latex"] },
  (_ctx: TemplateContext<LeafMeta, BranchMeta, ProjectMeta>, MultiTargetStego) => {
    // @ts-expect-error epub removes page-template support from the strict intersection
    MultiTargetStego.PageTemplate;

    // @ts-expect-error epub removes keep-together support from the strict intersection
    MultiTargetStego.KeepTogether;

    MultiTargetStego.Paragraph({ align: "center", fontSize: "12pt", children: "Portable body" });
    MultiTargetStego.Document({ bodyStyle: { spaceAfter: "12pt", lineSpacing: 1.5 }, children: [] });

    // @ts-expect-error epub removes font family from the strict intersection
    MultiTargetStego.Document({ bodyStyle: { fontFamily: "Times New Roman" }, children: [] });

    // @ts-expect-error epub removes inset support from the strict intersection
    MultiTargetStego.Paragraph({ insetLeft: "12pt", children: "Inset" });

    return (
      <MultiTargetStego.Document>
        <MultiTargetStego.Heading level={1} fontWeight="bold" color="#333333">
          Portable heading
        </MultiTargetStego.Heading>
        <MultiTargetStego.Paragraph>Portable body</MultiTargetStego.Paragraph>
      </MultiTargetStego.Document>
    );
  }
);

const epubTemplate = defineTemplate(
  { targets: ["epub"] },
  (_ctx: TemplateContext<LeafMeta, BranchMeta, ProjectMeta>, EpubStego) => {
    // @ts-expect-error epub-only templates do not expose page numbers
    EpubStego.PageNumber;

    // @ts-expect-error epub-only templates do not expose page breaks
    EpubStego.PageBreak;

    // @ts-expect-error epub-only templates do not allow image alignment controls
    EpubStego.Image({ src: "cover.png", align: "center" });

    EpubStego.Paragraph({ fontSize: "12pt", lineSpacing: 1.5, children: "EPUB body" });
    EpubStego.Heading({ level: 2, underline: true, smallCaps: true, color: "#666666", children: "Styled heading" });

    // @ts-expect-error epub-only templates do not allow font family controls
    EpubStego.Document({ bodyStyle: { fontFamily: "Times New Roman" }, children: [] });

    // @ts-expect-error epub-only templates do not allow paragraph inset defaults
    EpubStego.Section({ bodyStyle: { insetLeft: "12pt" }, children: [] });

    // @ts-expect-error epub-only templates do not allow font family on inline spans
    EpubStego.Span({ fontFamily: "Times New Roman", children: "Styled" });

    EpubStego.Spacer({ lines: 2, lineSpacing: 1.5 });

    // @ts-expect-error Spacer does not support font family overrides
    EpubStego.Spacer({ fontFamily: "Times New Roman" });

    return (
      <EpubStego.Document bodyStyle={{ fontSize: "12pt", lineSpacing: 1.5, spaceAfter: "12pt" }}>
        <EpubStego.Paragraph><EpubStego.Span italic>EPUB-safe body</EpubStego.Span></EpubStego.Paragraph>
        <EpubStego.Spacer />
      </EpubStego.Document>
    );
  }
);

const typedLeaf: LeafRecord<LeafMeta> = {
  kind: "leaf",
  id: "CH-ONE",
  branchId: "",
  format: "markdown",
  path: "/tmp/project/content/100-one.md",
  relativePath: "content/100-one.md",
  titleFromFilename: "One",
  metadata: {
    id: "CH-ONE",
    chapter: "1",
    chapter_title: "One",
    kind: "chapter"
  },
  body: "# One",
  order: 100,
  headings: []
};

const typedBranch: BranchRecord<BranchMeta, LeafMeta> = {
  kind: "branch",
  id: "reference",
  name: "reference",
  label: "Reference",
  parentId: "",
  depth: 1,
  relativeDir: "content/reference",
  metadata: {
    label: "Reference"
  },
  leaves: [typedLeaf],
  branches: []
};

const typedRootBranch: BranchRecord<BranchMeta, LeafMeta> = {
  kind: "branch",
  id: "",
  name: "content",
  label: "Content",
  depth: 0,
  relativeDir: "content",
  metadata: {},
  leaves: [],
  branches: [typedBranch]
};

const typedContext: TemplateContext<LeafMeta, BranchMeta, ProjectMeta> = {
  project: {
    id: "demo",
    root: "/tmp/project",
    metadata: {
      title: "Demo"
    }
  },
  content: {
    kind: "content",
    name: "content",
    label: "Content",
    relativeDir: "content",
    metadata: {},
    leaves: [],
    branches: [typedBranch]
  },
  allLeaves: [typedLeaf],
  allBranches: [typedRootBranch, typedBranch]
};

legacyTemplate.render(typedContext);
printTemplate.render(typedContext);
const latexTemplate = defineTemplate(
  { targets: ["latex"] },
  (_ctx: TemplateContext<LeafMeta, BranchMeta, ProjectMeta>, LatexStego) => (
    <LatexStego.Document bodyStyle={{ fontFamily: "Times New Roman" }}>
      <LatexStego.Paragraph>LATEX ONLY</LatexStego.Paragraph>
    </LatexStego.Document>
  )
);
latexTemplate.render(typedContext);
allPresentationTargetsTemplate.render(typedContext);
epubTemplate.render(typedContext);

// @ts-expect-error leaf metadata should be strongly typed
typedContext.allLeaves[0]?.metadata.not_a_real_key;

// @ts-expect-error branch leaf metadata should be strongly typed
typedContext.allBranches[1]?.leaves[0]?.metadata.not_a_real_key;

export {};
