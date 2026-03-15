import { defineTemplate, Stego, type BranchRecord, type LeafRecord, type TemplateContext } from "../template/index.ts";

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

const legacyTemplate = defineTemplate<ProjectMeta, LeafMeta, BranchMeta>((ctx) => {
  const firstLeaf = ctx.content[0];
  const chapter = firstLeaf?.metadata.chapter;
  const branchLabel = ctx.branches[0]?.metadata.label;
  const projectTitle = ctx.project.metadata.title;

  return (
    <Stego.Document page={{ size: "6x9", margin: "0.75in" }}>
      <Stego.PageTemplate footer={{ right: <Stego.PageNumber /> }} />
      <Stego.KeepTogether>
        <Stego.Heading level={1}>{projectTitle}</Stego.Heading>
        <Stego.Paragraph align="center">{chapter ?? branchLabel ?? "Untitled"}</Stego.Paragraph>
      </Stego.KeepTogether>
      {firstLeaf ? <Stego.Markdown leaf={firstLeaf} /> : null}
    </Stego.Document>
  );
});

const printTemplate = defineTemplate(
  { targets: ["docx", "pdf"] as const },
  (ctx: TemplateContext<ProjectMeta, LeafMeta, BranchMeta>, PrintStego) => {
    const firstLeaf = ctx.content[0];

    return (
      <PrintStego.Document page={{ size: "6x9", margin: "0.75in" }}>
        <PrintStego.PageTemplate footer={{ right: <PrintStego.PageNumber /> }} />
        <PrintStego.KeepTogether>
          <PrintStego.Heading level={1} spaceAfter={18}>
            {ctx.project.metadata.title}
          </PrintStego.Heading>
          <PrintStego.Paragraph align="center" firstLineIndent="2em">
            {ctx.project.metadata.author ?? "Anonymous"}
          </PrintStego.Paragraph>
        </PrintStego.KeepTogether>
        {firstLeaf ? <PrintStego.Markdown leaf={firstLeaf} /> : null}
      </PrintStego.Document>
    );
  }
);

const allPresentationTargetsTemplate = defineTemplate(
  { targets: ["docx", "pdf", "epub"] as const },
  (_ctx: TemplateContext<ProjectMeta, LeafMeta, BranchMeta>, MultiTargetStego) => {
    // @ts-expect-error epub removes page-template support from the strict intersection
    MultiTargetStego.PageTemplate;

    // @ts-expect-error epub removes keep-together support from the strict intersection
    MultiTargetStego.KeepTogether;

    // @ts-expect-error epub removes align support from the strict intersection
    MultiTargetStego.Paragraph({ align: "center", children: "Body" });

    return (
      <MultiTargetStego.Document>
        <MultiTargetStego.Paragraph>Portable body</MultiTargetStego.Paragraph>
      </MultiTargetStego.Document>
    );
  }
);

const epubTemplate = defineTemplate(
  { targets: ["epub"] as const },
  (_ctx: TemplateContext<ProjectMeta, LeafMeta, BranchMeta>, EpubStego) => {
    // @ts-expect-error epub-only templates do not expose page numbers
    EpubStego.PageNumber;

    // @ts-expect-error epub-only templates do not expose page breaks
    EpubStego.PageBreak;

    // @ts-expect-error epub-only templates do not allow image alignment controls
    EpubStego.Image({ src: "cover.png", align: "center" });

    return (
      <EpubStego.Document>
        <EpubStego.Paragraph>EPUB-safe body</EpubStego.Paragraph>
      </EpubStego.Document>
    );
  }
);

const typedLeaf: LeafRecord<LeafMeta> = {
  kind: "leaf",
  id: "CH-ONE",
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

const typedBranch: BranchRecord<BranchMeta> = {
  kind: "branch",
  key: "",
  name: "content",
  label: "Content",
  depth: 0,
  relativeDir: "content",
  metadata: {
    label: "Content"
  }
};

const typedContext: TemplateContext<ProjectMeta, LeafMeta, BranchMeta> = {
  project: {
    id: "demo",
    root: "/tmp/project",
    metadata: {
      title: "Demo"
    }
  },
  content: [typedLeaf],
  branches: [typedBranch]
};

legacyTemplate.render(typedContext);
printTemplate.render(typedContext);
allPresentationTargetsTemplate.render(typedContext);
epubTemplate.render(typedContext);

// @ts-expect-error leaf metadata should be strongly typed
typedContext.content[0]?.metadata.not_a_real_key;

export {};
