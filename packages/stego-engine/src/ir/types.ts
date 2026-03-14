export type AlignValue = "left" | "center" | "right";
export type PageSizeValue = "5x8" | "6x9" | "a5";
export type SpacingValue = number | `${number}pt` | `${number}in`;
export type SizeValue = number | `${number}%` | `${number}pt` | `${number}in`;
export type InsetValue = SpacingValue;
export type IndentValue = number | `${number}pt` | `${number}in` | `${number}em`;

export type PageRegionSpec = {
  left?: StegoNode;
  center?: StegoNode;
  right?: StegoNode;
};

export type PageSpec = {
  size?: PageSizeValue;
  margin?: SpacingValue;
};

export type StegoNode =
  | StegoDocumentNode
  | StegoFragmentNode
  | StegoKeepTogetherNode
  | StegoSectionNode
  | StegoHeadingNode
  | StegoParagraphNode
  | StegoMarkdownNode
  | StegoImageNode
  | StegoPageBreakNode
  | StegoPageTemplateNode
  | StegoPageNumberNode
  | StegoTextNode;

export type StegoDocumentNode = {
  kind: "document";
  page?: PageSpec;
  children: StegoNode[];
};

export type StegoFragmentNode = {
  kind: "fragment";
  children: StegoNode[];
};

export type StegoKeepTogetherNode = {
  kind: "keepTogether";
  children: StegoNode[];
};

export type StegoSectionNode = {
  kind: "section";
  role?: "frontmatter" | "body" | "backmatter" | "chapter" | "appendix";
  id?: string;
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  firstLineIndent?: IndentValue;
  align?: AlignValue;
  children: StegoNode[];
};

export type StegoHeadingNode = {
  kind: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  align?: AlignValue;
  children: StegoNode[];
};

export type StegoParagraphNode = {
  kind: "paragraph";
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  firstLineIndent?: IndentValue;
  align?: AlignValue;
  children: StegoNode[];
};

export type StegoMarkdownNode = {
  kind: "markdown";
  source: string;
};

export type StegoImageNode = {
  kind: "image";
  src: string;
  alt?: string;
  width?: SizeValue;
  height?: SizeValue;
  layout?: "block" | "inline";
  align?: AlignValue;
  caption?: string;
};

export type StegoPageBreakNode = {
  kind: "pageBreak";
};

export type StegoPageTemplateNode = {
  kind: "pageTemplate";
  header?: PageRegionSpec;
  footer?: PageRegionSpec;
};

export type StegoPageNumberNode = {
  kind: "pageNumber";
};

export type StegoTextNode = {
  kind: "text";
  value: string;
};
