import { defineTemplate, Stego } from "@stego/engine";

export default defineTemplate((ctx) => {
  const generatedAt = new Date().toISOString();
  const chapterGroups = ctx.collections.manuscripts.splitBy("chapter");
  const spineSections = ctx.collections.spineCategories
    .sortBy("label")
    .map((category) => ({
      category,
      entries: ctx.collections.spineEntries
        .where((entry) => entry.category === category.key)
        .sortBy((entry) => entry.label.toLowerCase())
        .all()
    }))
    .filter((section) => section.entries.length > 0);

  const tocEntries = [
    ...chapterGroups
      .filter(hasTitledBoundary)
      .map((group) => {
        const heading = formatChapterHeading(group.value, group.first.metadata.chapter_title);
        return `- [${heading}](#${slugify(heading)})`;
      }),
    ...(spineSections.length > 0
      ? [
          "- [Reference Spine](#reference-spine)",
          ...spineSections.map((section) => `  - [${section.category.label}](#${slugify(section.category.label)})`)
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
          {group.items.map((doc) => (
            <>
              <Stego.Markdown
                source={`<!-- source: ${doc.relativePath} | order: ${doc.order} | status: ${String(doc.metadata.status ?? "")} -->`}
              />
              <Stego.Markdown source={doc.body} />
            </>
          ))}
        </Stego.Section>
      ))}

      {spineSections.length > 0 ? (
        <Stego.Section role="appendix" id="reference-spine">
          <Stego.PageBreak />
          <Stego.Heading level={2} spaceBefore={48} spaceAfter={24}>
            Reference Spine
          </Stego.Heading>
          <Stego.Paragraph spaceAfter={24}>
            This appendix is rendered directly from the project spine so the built manual carries the same reference graph used by the editor and sidebar.
          </Stego.Paragraph>
          {spineSections.map((section) => (
            <Stego.Section id={slugify(section.category.label)}>
              <Stego.Heading level={3} spaceBefore={32} spaceAfter={16}>
                {section.category.label}
              </Stego.Heading>
              {section.entries.map((entry) => (
                <Stego.Section id={slugify(entry.key)}>
                  <Stego.Markdown source={`<!-- spine source: ${entry.relativePath} -->`} />
                  <Stego.Heading level={4} spaceBefore={20} spaceAfter={10}>
                    {entry.label}
                  </Stego.Heading>
                  {renderSpineEntryBody(entry.body)}
                </Stego.Section>
              ))}
            </Stego.Section>
          ))}
        </Stego.Section>
      ) : null}
    </Stego.Document>
  );
});

function formatChapterHeading(value: string, rawTitle: unknown): string {
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  return title ? `Chapter ${value}: ${title}` : `Chapter ${value}`;
}

function hasTitledBoundary<T extends { value?: string }>(group: T): group is T & { value: string } {
  return typeof group.value === "string" && group.value.trim().length > 0;
}

function renderSpineEntryBody(source: string) {
  const withoutFrontmatter = source.replace(/^---\n[\s\S]*?\n---\n+/, "");
  const body = withoutFrontmatter.replace(/^#\s+.*\n+/, "").trim();
  return body ? <Stego.Markdown source={body} /> : <Stego.Paragraph>Entry body not provided.</Stego.Paragraph>;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
