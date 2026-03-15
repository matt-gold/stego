import { defineTemplate, Stego, type BranchRecord, type LeafRecord, type TemplateContext } from "../index.ts";

type ProjectMeta = {
  title: string;
  author?: string;
};

type LeafMeta = {
  chapter?: string;
  chapter_title?: string;
  kind?: "reference" | "chapter";
};

type BranchMeta = {
  label?: string;
};

const typedTemplate = defineTemplate<ProjectMeta, LeafMeta, BranchMeta>((ctx) => {
  const firstLeaf = ctx.content[0];
  const chapter = firstLeaf?.metadata.chapter;
  const branchLabel = ctx.branches[0]?.metadata.label;
  const projectTitle = ctx.project.metadata.title;

  return (
    <Stego.Document>
      <Stego.Heading level={1}>{projectTitle}</Stego.Heading>
      <Stego.Paragraph>{chapter ?? branchLabel ?? "Untitled"}</Stego.Paragraph>
      {firstLeaf ? <Stego.Markdown leaf={firstLeaf} /> : null}
    </Stego.Document>
  );
});

const typedLeaf: LeafRecord<LeafMeta> = {
  kind: "leaf",
  id: "CH-ONE",
  format: "markdown",
  path: "/tmp/project/content/100-one.md",
  relativePath: "content/100-one.md",
  titleFromFilename: "One",
  metadata: {
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

typedTemplate.render(typedContext);

// @ts-expect-error leaf metadata should be strongly typed
typedContext.content[0]?.metadata.not_a_real_key;

export {};
