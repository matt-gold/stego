import { defineTemplate, Stego } from "@stego-labs/engine";

export default defineTemplate((ctx) => {
  const generatedAt = new Date().toISOString();
  const storyLeaves = ctx.content.filter((leaf) => leaf.metadata.kind !== "reference");
  const chapterGroups = Stego.splitBy(storyLeaves, (leaf) => asString(leaf.metadata.chapter));
  const tocEntries = chapterGroups
    .filter(hasTitledBoundary)
    .map((group) => {
      const heading = formatChapterHeading(group.value, group.first.metadata.chapter_title);
      return `- [${heading}](#${slugify(heading)})`;
    });
  const sources = ctx.content
    .filter((leaf) => leaf.metadata.kind === "reference" && leaf.relativePath.includes("/sources/"))
    .sort((a, b) => a.id.localeCompare(b.id));

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

      <Stego.Image
        src="assets/maps/city-plan.png"
        alt="Map of the city"
        width="65%"
        layout="block"
        align="center"
        caption="A rough plan of the city and its institutions."
      />

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

      {sources.length > 0 ? <Stego.PageBreak /> : null}
      {sources.length > 0 ? (
        <Stego.Section role="backmatter" id="sources">
          <Stego.Heading level={2} spaceAfter={18}>Source Notes</Stego.Heading>
          <Stego.Paragraph spaceAfter={12}>
            These reference leaves can also be linked inline, for example <Stego.Link leaf="SRC-GALEN" />.
          </Stego.Paragraph>
          {sources.map((leaf) => (
            <Stego.Section id={leaf.id}>
              <Stego.Heading level={3} spaceAfter={12}>{String(leaf.metadata.label ?? leaf.id)}</Stego.Heading>
              <Stego.Markdown leaf={leaf} />
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
