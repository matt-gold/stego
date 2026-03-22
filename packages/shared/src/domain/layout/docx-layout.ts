export type DocxLayoutAlign = "left" | "center" | "right";

export type DocxDocumentStyleSpec = {
  fontFamily?: string;
  fontSizePt?: number;
  lineSpacing?: number;
  spaceBefore?: string;
  spaceAfter?: string;
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
};
