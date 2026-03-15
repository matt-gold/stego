import { defineTemplate, Stego } from "@stego-labs/engine";

export default defineTemplate((ctx) => {
  const generatedAt = new Date().toISOString();
  const chapterLeaves = ctx.content.filter((leaf) => leaf.metadata.kind !== "reference");
  const chapterGroups = Stego.splitBy(chapterLeaves, (leaf) => asString(leaf.metadata.chapter));
  const referenceSections = groupReferenceLeaves(ctx.content.filter((leaf) => leaf.metadata.kind === "reference"));

  const tocEntries = [
    ...chapterGroups
      .filter(hasTitledBoundary)
      .map((group) => {
        const heading = formatChapterHeading(group.value, group.first.metadata.chapter_title);
        return `- [${heading}](#${slugify(heading)})`;
      }),
    ...(referenceSections.length > 0
      ? [
          "- [Reference Leaves](#reference-leaves)",
          ...referenceSections.map((section) => `  - [${section.label}](#${slugify(section.label)})`)
        ]
      : [])
  ];

  return (
    <Stego.Document page={{ size: "6x9", margin: "0.75in" }}>
      <Stego.PageTemplate footer={{ right: <Stego.PageNumber /> }} />

      <Stego.Markdown source={`<!-- generated: ${generatedAt} -->`} />
      <Stego.Heading level={1}>{String(ctx.project.metadata.title ?? ctx.project.id)}</Stego.Heading>

      {ctx.project.metadata.subtitle ? (
        <Stego.Paragraph spaceAfter={18}>{String(ctx.project.metadata.subtitle)}</Stego.Paragraph>
      ) : null}

      {ctx.project.metadata.author ? (
        <Stego.Paragraph spaceAfter={24}>{String(ctx.project.metadata.author)}</Stego.Paragraph>
      ) : null}

      <Stego.Markdown source={`Generated: ${generatedAt}`} />
      <Stego.Heading level={2}>Table of Contents</Stego.Heading>
      {tocEntries.length > 0 ? <Stego.Markdown source={tocEntries.join("\n")} /> : null}

      {chapterGroups.map((group, index) => (
        <Stego.Section role="chapter" id={group.value ? `chapter-${group.value}` : undefined}>
          {group.value && index > 0 ? <Stego.PageBreak /> : null}
          {group.value ? (
            <Stego.Heading level={2} spaceBefore={48} spaceAfter={24}>
              {formatChapterHeading(group.value, group.first.metadata.chapter_title)}
            </Stego.Heading>
          ) : null}
          {group.items.map((leaf) => (
            <>
              <Stego.Markdown
                source={`<!-- source: ${leaf.relativePath} | id: ${leaf.id} | order: ${leaf.order} | status: ${String(leaf.metadata.status ?? "")} -->`}
              />
              <Stego.Markdown leaf={leaf} />
            </>
          ))}
        </Stego.Section>
      ))}

      {referenceSections.length > 0 ? (
        <Stego.Section role="appendix" id="reference-leaves">
          <Stego.PageBreak />
          <Stego.Heading level={2} spaceBefore={48} spaceAfter={24}>Reference Leaves</Stego.Heading>
          <Stego.Paragraph spaceAfter={24}>
            This appendix is rendered from reference leaves under <Stego.Link leaf="CON-WORKSPACE">content/reference</Stego.Link>, proving the same leaf model can drive both narrative chapters and technical backmatter.
          </Stego.Paragraph>
          {referenceSections.map((section) => (
            <Stego.Section id={slugify(section.label)}>
              <Stego.Heading level={3} spaceBefore={32} spaceAfter={16}>{section.label}</Stego.Heading>
              {section.items.map((leaf) => (
                <Stego.Section id={leaf.id}>
                  <Stego.Markdown source={`<!-- reference source: ${leaf.relativePath} -->`} />
                  <Stego.Heading level={4} spaceBefore={20} spaceAfter={10}>{String(leaf.metadata.label ?? leaf.id)}</Stego.Heading>
                  <Stego.Markdown leaf={leaf} />
                </Stego.Section>
              ))}
            </Stego.Section>
          ))}
        </Stego.Section>
      ) : null}
    </Stego.Document>
  );
});

function asString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function groupReferenceLeaves(leaves: Array<{ relativePath: string; metadata: Record<string, unknown> }>) {
  const groups = new Map<string, typeof leaves>();
  for (const leaf of leaves) {
    const relative = leaf.relativePath.replace(/^content\/reference\//, "");
    const sectionKey = relative.includes("/") ? relative.split("/")[0] : "reference";
    const existing = groups.get(sectionKey) || [];
    existing.push(leaf);
    groups.set(sectionKey, existing);
  }
  return Array.from(groups.entries())
    .map(([key, items]) => ({
      key,
      label: toDisplayLabel(key),
      items: items.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function formatChapterHeading(value: string, rawTitle: unknown): string {
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  return title ? `Chapter ${value}: ${title}` : `Chapter ${value}`;
}

function hasTitledBoundary<T extends { value?: string }>(group: T): group is T & { value: string } {
  return typeof group.value === "string" && group.value.trim().length > 0;
}

function toDisplayLabel(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
