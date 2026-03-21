export type DocxLayoutAlign = "left" | "center" | "right";

export type DocxDocumentStyleSpec = {
  fontFamily?: string;
  fontSizePt?: number;
  lineSpacing?: number;
  parSpaceBefore?: string;
  parSpaceAfter?: string;
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
  keepTogether?: boolean;
};

export const DOCX_LAYOUT_BOOKMARK_PREFIX = "stego-layout-";

export function createDocxLayoutBookmarkName(index: number): string {
  return `${DOCX_LAYOUT_BOOKMARK_PREFIX}${index}`;
}

export function isDocxLayoutBookmarkName(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith(DOCX_LAYOUT_BOOKMARK_PREFIX);
}
