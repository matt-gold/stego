export type AlignValue = "left" | "center" | "right";
export type PageSizeValue = "5x8" | "6x9" | "a5" | "letter";
export type SpacingValue = number | `${number}pt` | `${number}in`;
export type SizeValue = number | `${number}%` | `${number}pt` | `${number}in`;
export type InsetValue = SpacingValue;
export type IndentValue = number | `${number}pt` | `${number}in` | `${number}em`;
export type CommonFontFamily = "Times New Roman" | "Courier New" | "Arial" | "Georgia";
export type FontFamilyValue = CommonFontFamily | (string & {});
export type FontSizeValue = number | `${number}pt`;
export type LineSpacingValue = number;

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
  | StegoMarkdownParagraphNode
  | StegoMarkdownHeadingNode
  | StegoMarkdownBlockNode
  | StegoMarkdownNode
  | StegoPlainTextNode
  | StegoImageNode
  | StegoPageBreakNode
  | StegoPageTemplateNode
  | StegoPageNumberNode
  | StegoLinkNode
  | StegoTextNode;

export type StegoInlineNode = StegoTextNode | StegoLinkNode;

export type StegoDocumentNode = {
  kind: "document";
  page?: PageSpec;
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
  parSpaceBefore?: SpacingValue;
  parSpaceAfter?: SpacingValue;
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
  parSpaceBefore?: SpacingValue;
  parSpaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  firstLineIndent?: IndentValue;
  align?: AlignValue;
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
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
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
  children: StegoInlineNode[];
};

export type StegoParagraphNode = {
  kind: "paragraph";
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  firstLineIndent?: IndentValue;
  align?: AlignValue;
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
  children: StegoInlineNode[];
};

export type StegoMarkdownParagraphNode = {
  kind: "markdownParagraph";
  source: string;
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
};

export type StegoMarkdownHeadingNode = {
  kind: "markdownHeading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  source: string;
  anchorId?: string;
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
};

export type StegoMarkdownBlockNode = {
  kind: "markdownBlock";
  source: string;
};

export type StegoMarkdownNode = {
  kind: "markdown";
  source?: string;
  leaf?: {
    id: string;
    body: string;
  };
};

export type StegoPlainTextNode = {
  kind: "plainText";
  source?: string;
  leaf?: {
    id: string;
    body: string;
  };
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

export type StegoLinkNode = {
  kind: "link";
  leaf: string;
  heading?: string;
  anchor?: string;
  children: StegoInlineNode[];
};
