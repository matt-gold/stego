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
export type FontWeightValue = "normal" | "bold";
export type ColorValue = `#${string}`;
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type BodyStyle = {
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  firstLineIndent?: IndentValue;
  align?: AlignValue;
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
};

export type HeadingStyle = {
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  align?: AlignValue;
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
  fontWeight?: FontWeightValue;
  italic?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
  color?: ColorValue;
};

export type HeadingStyleMap = Partial<Record<HeadingLevel, HeadingStyle>>;

export type PageRegionSpec = {
  left?: StegoPageRegionInlineNode[];
  center?: StegoPageRegionInlineNode[];
  right?: StegoPageRegionInlineNode[];
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
  | StegoSpacerNode
  | StegoMarkdownParagraphNode
  | StegoMarkdownHeadingNode
  | StegoMarkdownBlockNode
  | StegoMarkdownNode
  | StegoPlainTextNode
  | StegoImageNode
  | StegoPageBreakNode
  | StegoPageTemplateNode
  | StegoPageNumberNode
  | StegoSpanNode
  | StegoLinkNode
  | StegoTextNode;

export type StegoInlineNode = StegoTextNode | StegoLinkNode | StegoSpanNode;
export type StegoPageRegionInlineNode = StegoTextNode | StegoSpanNode | StegoPageNumberNode;

export type StegoDocumentNode = {
  kind: "document";
  page?: PageSpec;
  bodyStyle?: BodyStyle;
  headingStyle?: HeadingStyle;
  headingStyles?: HeadingStyleMap;
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
  bodyStyle?: BodyStyle;
  headingStyle?: HeadingStyle;
  headingStyles?: HeadingStyleMap;
  children: StegoNode[];
};

export type StegoHeadingNode = {
  kind: "heading";
  level: HeadingLevel;
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  align?: AlignValue;
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
  fontWeight?: FontWeightValue;
  italic?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
  color?: ColorValue;
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

export type StegoSpacerNode = {
  kind: "spacer";
  lines: number;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
};

export type StegoMarkdownParagraphNode = {
  kind: "markdownParagraph";
  source: string;
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  firstLineIndent?: IndentValue;
  align?: AlignValue;
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
};

export type StegoMarkdownHeadingNode = {
  kind: "markdownHeading";
  level: HeadingLevel;
  source: string;
  anchorId?: string;
  spaceBefore?: SpacingValue;
  spaceAfter?: SpacingValue;
  insetLeft?: InsetValue;
  insetRight?: InsetValue;
  align?: AlignValue;
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  lineSpacing?: LineSpacingValue;
  fontWeight?: FontWeightValue;
  italic?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
  color?: ColorValue;
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

export type StegoSpanNode = {
  kind: "span";
  fontFamily?: FontFamilyValue;
  fontSize?: FontSizeValue;
  fontWeight?: FontWeightValue;
  italic?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
  color?: ColorValue;
  children: StegoInlineNode[];
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
