import { defineTemplate, Stego } from "stego-engine";

export default defineTemplate((ctx) => {
  const generatedAt = new Date().toISOString();
  const chapterGroups = ctx.collections.manuscripts.splitBy("chapter");
  const tocEntries = chapterGroups
    .filter(hasTitledBoundary)
    .map((group) => {
      const heading = formatChapterHeading(group.value, group.first.metadata.chapter_title);
      return `- [${heading}](#${slugify(heading)})`;
    });

  return (
    <Stego.Document page={{ size: "6x9", margin: "0.75in" }}>
      <Stego.PageTemplate footer={{ right: <Stego.PageNumber /> }} />

      <Stego.Markdown source={`<!-- generated: ${generatedAt} -->`} />
      <Stego.Heading level={1}>
        {String(ctx.project.metadata.title ?? ctx.project.id)}
      </Stego.Heading>

      {ctx.project.metadata.subtitle ? (
        <Stego.Paragraph spaceAfter={18}>
          {String(ctx.project.metadata.subtitle)}
        </Stego.Paragraph>
      ) : null}

      {ctx.project.metadata.author ? (
        <Stego.Paragraph spaceAfter={24}>
          {String(ctx.project.metadata.author)}
        </Stego.Paragraph>
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
