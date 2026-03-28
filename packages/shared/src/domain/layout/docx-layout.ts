export type DocxLayoutAlign = "left" | "center" | "right";

export type DocxDocumentStyleSpec = {
  fontFamily?: string;
  fontSizePt?: number;
  lineSpacing?: number;
  spaceBefore?: string;
  spaceAfter?: string;
};

export type DocxCharacterStyleSpec = {
  styleId: string;
  fontFamily?: string;
  fontSizePt?: number;
  fontWeight?: "normal" | "bold";
  italic?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
  color?: string;
};

export type DocxPageRegionNode =
  | { kind: "text"; value: string }
  | {
      kind: "span";
      fontFamily?: string;
      fontSizePt?: number;
      fontWeight?: "normal" | "bold";
      italic?: boolean;
      underline?: boolean;
      smallCaps?: boolean;
      color?: string;
      children: DocxPageRegionNode[];
    }
  | { kind: "pageNumber" };

export type DocxPageRegion = {
  left?: DocxPageRegionNode[];
  center?: DocxPageRegionNode[];
  right?: DocxPageRegionNode[];
};

export type DocxPageTemplateSpec = {
  header?: DocxPageRegion;
  footer?: DocxPageRegion;
  defaultFontFamily?: string;
  defaultFontSizePt?: number;
  defaultLineSpacing?: number;
};

export type DocxBlockLayoutSpec = {
  bookmarkName: string;
  pageBreak?: boolean;
  spaceBefore?: string;
  spaceAfter?: string;
  insetLeft?: string;
  insetRight?: string;
  firstLineIndent?: string;
  align?: DocxLayoutAlign;
  fontFamily?: string;
  fontSizePt?: number;
  lineSpacing?: number;
  fontWeight?: "normal" | "bold";
  italic?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
  color?: string;
  keepTogether?: boolean;
  spacerLines?: number;
};
