import fs from "node:fs";
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type {
  DocxBlockLayoutSpec,
  DocxCharacterStyleSpec,
  DocxDocumentStyleSpec,
  DocxPageRegion,
  DocxPageRegionNode,
  DocxPageTemplateSpec,
} from "@stego-labs/shared/domain/layout";

const DOCUMENT_XML_PATH = "word/document.xml";
const STYLES_XML_PATH = "word/styles.xml";
const CONTENT_TYPES_XML_PATH = "[Content_Types].xml";
const DOCUMENT_RELS_XML_PATH = "word/_rels/document.xml.rels";
const HEADER_XML_PATH = "word/header1.xml";
const FOOTER_XML_PATH = "word/footer1.xml";
const ELEMENT_NODE = 1;
const DEFAULT_EM_IN_POINTS = 12;
const DEFAULT_USABLE_PAGE_WIDTH_TWIPS = 9360;
const PANDOC_BODY_PARAGRAPH_STYLE_IDS = ["BodyText", "FirstParagraph", "Compact"] as const;
const PANDOC_HEADING_STYLE_IDS = ["Heading1", "Heading2", "Heading3", "Heading4", "Heading5", "Heading6"] as const;
const PANDOC_HEADING_CHARACTER_STYLE_IDS = [
  "Heading1Char",
  "Heading2Char",
  "Heading3Char",
  "Heading4Char",
  "Heading5Char",
  "Heading6Char"
] as const;
type XmlDocument = ReturnType<DOMParser["parseFromString"]>;
type XmlElement = XmlDocument["documentElement"];

type DocxLayoutPostprocess = {
  blockLayouts?: DocxBlockLayoutSpec[];
  documentStyle?: DocxDocumentStyleSpec;
  characterStyles?: DocxCharacterStyleSpec[];
  pageTemplate?: DocxPageTemplateSpec;
};

export async function applyDocxLayout(
  docxPath: string,
  input: DocxBlockLayoutSpec[] | DocxLayoutPostprocess = []
): Promise<void> {
  const postprocess = normalizePostprocess(input);
  if (
    (postprocess.blockLayouts?.length || 0) === 0
    && !postprocess.documentStyle
    && (postprocess.characterStyles?.length || 0) === 0
    && !postprocess.pageTemplate
  ) {
    return;
  }

  const archive = await JSZip.loadAsync(fs.readFileSync(docxPath));
  let changed = false;

  const documentXml = archive.file(DOCUMENT_XML_PATH);
  if (documentXml && (postprocess.blockLayouts?.length || 0) > 0) {
    const source = await documentXml.async("string");
    const rewritten = applyDocxLayoutToDocumentXml(source, postprocess.blockLayouts || []);
    if (rewritten !== source) {
      archive.file(DOCUMENT_XML_PATH, rewritten);
      changed = true;
    }
  }

  if (postprocess.documentStyle || (postprocess.characterStyles?.length || 0) > 0) {
    const stylesXml = archive.file(STYLES_XML_PATH);
    const source = stylesXml
      ? await stylesXml.async("string")
      : `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:styles>`;
    const rewritten = applyDocxStylesToStylesXml(source, {
      documentStyle: postprocess.documentStyle,
      characterStyles: postprocess.characterStyles,
    });
    if (rewritten !== source) {
      archive.file(STYLES_XML_PATH, rewritten);
      changed = true;
    }
  }

  if (postprocess.pageTemplate) {
    const pageTemplateChanged = await applyDocxPageTemplateToArchive(archive, postprocess.pageTemplate);
    if (pageTemplateChanged) {
      changed = true;
    }
  }

  if (!changed) {
    return;
  }

  const output = await archive.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(docxPath, output);
}

export function applyDocxLayoutToDocumentXml(source: string, specs: DocxBlockLayoutSpec[] = []): string {
  if (specs.length === 0) {
    return source;
  }

  const document = new DOMParser().parseFromString(source, "application/xml");
  const body = findFirstElement(document.documentElement, "w:body");
  if (!body) {
    return source;
  }

  const specByBookmark = new Map(specs.map((spec) => [spec.bookmarkName, spec]));
  const groups: { spec: DocxBlockLayoutSpec; paragraphs: XmlElement[] }[] = [];
  const activeGroups = new Map<string, { spec: DocxBlockLayoutSpec; paragraphs: XmlElement[] }>();

  for (const child of elementChildren(body)) {
    if (child.nodeName === "w:bookmarkStart") {
      const name = child.getAttribute("w:name");
      const id = child.getAttribute("w:id");
      const spec = name ? specByBookmark.get(name) : undefined;
      if (id && spec) {
        const group = { spec, paragraphs: [] as XmlElement[] };
        activeGroups.set(id, group);
        groups.push(group);
      }
      continue;
    }

    if (child.nodeName === "w:bookmarkEnd") {
      const id = child.getAttribute("w:id");
      if (id) {
        activeGroups.delete(id);
      }
      continue;
    }

    if (child.nodeName === "w:p" && activeGroups.size > 0) {
      for (const group of activeGroups.values()) {
        group.paragraphs.push(child);
      }
    }
  }

  let changed = false;
  for (const group of groups) {
    const paragraphs = uniqueParagraphs(group.paragraphs);
    if (paragraphs.length === 0) {
      if (group.spec.pageBreak && applyEmptyMarkerPageBreak(body, group.spec.bookmarkName)) {
        changed = true;
      }
      if (group.spec.spacerLines && insertStandaloneSpacer(body, group.spec, document)) {
        changed = true;
      }
      continue;
    }
    if (applySpecToParagraphs(paragraphs, group.spec)) {
      changed = true;
    }
  }

  if (!changed) {
    return source;
  }

  return new XMLSerializer().serializeToString(document);
}

export function applyDocxDocumentStyleToStylesXml(
  source: string,
  style: DocxDocumentStyleSpec | undefined
): string {
  return applyDocxStylesToStylesXml(source, { documentStyle: style });
}

function applyDocxStylesToStylesXml(
  source: string,
  input: {
    documentStyle?: DocxDocumentStyleSpec;
    characterStyles?: DocxCharacterStyleSpec[];
  },
): string {
  if (
    !input.documentStyle
    && (!input.characterStyles || input.characterStyles.length === 0)
  ) {
    return source;
  }

  const style = input.documentStyle;
  if (
    !style
    || (
      !style.fontFamily
      && style.fontSizePt === undefined
      && style.lineSpacing === undefined
      && style.spaceBefore === undefined
      && style.spaceAfter === undefined
    )
  ) {
    if (!input.characterStyles || input.characterStyles.length === 0) {
      return source;
    }
  }

  const document = new DOMParser().parseFromString(source, "application/xml");
  const root = document.documentElement;
  if (!root) {
    return source;
  }

  let changed = false;
  if (style) {
    const normalStyle = findOrCreateNormalParagraphStyle(root, document);
    const paragraphProperties = findOrCreateChild(normalStyle, "w:pPr", document);
    const runProperties = findOrCreateChild(normalStyle, "w:rPr", document);

    if (setStyleLineSpacing(paragraphProperties, style.lineSpacing, document)) {
      changed = true;
    }
    if (setStyleParagraphSpacing(paragraphProperties, style.spaceBefore, style.spaceAfter, document)) {
      changed = true;
    }
    if (setRunFontFamily(runProperties, style.fontFamily, document)) {
      changed = true;
    }
    if (setRunFontSize(runProperties, style.fontSizePt, document)) {
      changed = true;
    }
    if (applyPandocBodyParagraphStyleDefaults(root, style, document)) {
      changed = true;
    }
    if (applyPandocHeadingStyleDefaults(root, style, document)) {
      changed = true;
    }
    if (applyPandocHeadingCharacterStyleDefaults(root, style, document)) {
      changed = true;
    }
  }

  if (input.characterStyles && input.characterStyles.length > 0) {
    if (applyCharacterStyles(root, input.characterStyles, document)) {
      changed = true;
    }
  }

  if (!changed) {
    return source;
  }

  return new XMLSerializer().serializeToString(document);
}

function normalizePostprocess(input: DocxBlockLayoutSpec[] | DocxLayoutPostprocess): DocxLayoutPostprocess {
  if (Array.isArray(input)) {
    return { blockLayouts: input };
  }
  return input || {};
}

function applySpecToParagraphs(paragraphs: XmlElement[], spec: DocxBlockLayoutSpec): boolean {
  let changed = false;

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const isLast = index === paragraphs.length - 1;

    if (spec.pageBreak && index === 0) {
      if (ensureParagraphFlag(paragraph, "w:pageBreakBefore")) {
        changed = true;
      }
    }

    if (spec.keepTogether) {
      if (ensureParagraphFlag(paragraph, "w:keepLines")) {
        changed = true;
      }
      if (!isLast && ensureParagraphFlag(paragraph, "w:keepNext")) {
        changed = true;
      }
    }

    if (setParagraphSpacing(paragraph, spec)) {
      changed = true;
    }
    if (setParagraphIndent(paragraph, spec)) {
      changed = true;
    }
    if (setParagraphAlignment(paragraph, spec.align)) {
      changed = true;
    }
    if (setParagraphLineSpacing(paragraph, spec.lineSpacing)) {
      changed = true;
    }
    if (setParagraphRunTypography(paragraph, spec)) {
      changed = true;
    }
  }

  return changed;
}

function applyEmptyMarkerPageBreak(body: XmlElement, bookmarkName: string): boolean {
  const bookmarkStart = findBookmarkStart(body, bookmarkName);
  if (!bookmarkStart) {
    return false;
  }

  const bookmarkId = bookmarkStart.getAttribute("w:id");
  const nextParagraph = findFirstParagraphAfterBookmarkRange(body, bookmarkStart, bookmarkId);
  if (!nextParagraph) {
    return false;
  }

  return ensureParagraphFlag(nextParagraph, "w:pageBreakBefore");
}

function findBookmarkStart(body: XmlElement, bookmarkName: string): XmlElement | null {
  for (let index = 0; index < body.childNodes.length; index += 1) {
    const child = body.childNodes.item(index);
    if (child?.nodeType !== ELEMENT_NODE) {
      continue;
    }
    const element = child as XmlElement;
    if (element.nodeName === "w:bookmarkStart" && element.getAttribute("w:name") === bookmarkName) {
      return element;
    }
  }

  return null;
}

function findFirstParagraphAfterBookmarkRange(
  body: XmlElement,
  bookmarkStart: XmlElement,
  bookmarkId: string | null,
): XmlElement | null {
  let cursor = bookmarkStart.nextSibling;
  let pastRange = !bookmarkId;

  while (cursor) {
    if (cursor.nodeType !== ELEMENT_NODE) {
      cursor = cursor.nextSibling;
      continue;
    }

    const element = cursor as XmlElement;
    if (!pastRange) {
      if (element.nodeName === "w:bookmarkEnd" && element.getAttribute("w:id") === bookmarkId) {
        pastRange = true;
      }
      cursor = cursor.nextSibling;
      continue;
    }

    if (element.nodeName === "w:p") {
      return element;
    }

    cursor = cursor.nextSibling;
  }

  return null;
}

function insertStandaloneSpacer(body: XmlElement, spec: DocxBlockLayoutSpec, document: XmlDocument): boolean {
  const lines = spec.spacerLines;
  if (!lines || !Number.isInteger(lines) || lines < 1) {
    return false;
  }

  for (let index = 0; index < body.childNodes.length; index += 1) {
    const child = body.childNodes.item(index);
    if (child?.nodeType !== ELEMENT_NODE) {
      continue;
    }
    const element = child as XmlElement;
    if (element.nodeName !== "w:bookmarkStart" || element.getAttribute("w:name") !== spec.bookmarkName) {
      continue;
    }

    const paragraph = document.createElement("w:p");
    const paragraphProperties = findOrCreateParagraphProperties(paragraph, document);
    const spacing = findOrCreateChild(paragraphProperties, "w:spacing", document);

    const lineSpacing = normalizeLineSpacing(spec.lineSpacing);
    if (lineSpacing !== undefined) {
      setAttributeValue(spacing, "w:line", String(Math.round(240 * lineSpacing)));
      setAttributeValue(spacing, "w:lineRule", "auto");
    }

    const spacerAfter = toSpacerAfterTwips(spec);
    if (spacerAfter !== undefined) {
      setAttributeValue(spacing, "w:after", spacerAfter);
    }

    const run = document.createElement("w:r");
    paragraph.appendChild(run);

    const insertBefore = element.nextSibling;
    if (insertBefore) {
      body.insertBefore(paragraph, insertBefore);
    } else {
      body.appendChild(paragraph);
    }
    return true;
  }

  return false;
}

function uniqueParagraphs(paragraphs: XmlElement[]): XmlElement[] {
  const seen = new Set<XmlElement>();
  const unique: XmlElement[] = [];
  for (const paragraph of paragraphs) {
    if (seen.has(paragraph)) {
      continue;
    }
    seen.add(paragraph);
    unique.push(paragraph);
  }
  return unique;
}

function ensureParagraphFlag(paragraph: XmlElement, propertyName: string): boolean {
  const document = paragraph.ownerDocument;
  if (!document) {
    return false;
  }

  const paragraphProperties = findOrCreateParagraphProperties(paragraph, document);
  if (findFirstElement(paragraphProperties, propertyName)) {
    return false;
  }

  paragraphProperties.appendChild(document.createElement(propertyName));
  return true;
}

function setParagraphSpacing(paragraph: XmlElement, spec: DocxBlockLayoutSpec): boolean {
  const before = toTwips(spec.spaceBefore);
  const after = toTwips(spec.spaceAfter);
  if (!before && !after) {
    return false;
  }

  const document = paragraph.ownerDocument;
  if (!document) {
    return false;
  }

  const paragraphProperties = findOrCreateParagraphProperties(paragraph, document);
  const spacing = findOrCreateChild(paragraphProperties, "w:spacing", document);

  let changed = false;
  if (before && setAttributeValue(spacing, "w:before", before)) {
    changed = true;
  }
  if (after && setAttributeValue(spacing, "w:after", after)) {
    changed = true;
  }
  return changed;
}

function setParagraphLineSpacing(paragraph: XmlElement, lineSpacing: number | undefined): boolean {
  const normalized = normalizeLineSpacing(lineSpacing);
  if (normalized === undefined) {
    return false;
  }
  const document = paragraph.ownerDocument;
  if (!document) {
    return false;
  }

  const paragraphProperties = findOrCreateParagraphProperties(paragraph, document);
  const spacing = findOrCreateChild(paragraphProperties, "w:spacing", document);
  const lineTwips = String(Math.round(240 * normalized));
  let changed = false;
  if (setAttributeValue(spacing, "w:line", lineTwips)) {
    changed = true;
  }
  if (setAttributeValue(spacing, "w:lineRule", "auto")) {
    changed = true;
  }
  return changed;
}

function setParagraphIndent(paragraph: XmlElement, spec: DocxBlockLayoutSpec): boolean {
  const left = toTwips(spec.insetLeft);
  const right = toTwips(spec.insetRight);
  const firstLine = toTwips(spec.firstLineIndent);
  if (!left && !right && !firstLine) {
    return false;
  }

  const document = paragraph.ownerDocument;
  if (!document) {
    return false;
  }

  const paragraphProperties = findOrCreateParagraphProperties(paragraph, document);
  const indent = findOrCreateChild(paragraphProperties, "w:ind", document);

  let changed = false;
  if (left && setAttributeValue(indent, "w:left", left)) {
    changed = true;
  }
  if (right && setAttributeValue(indent, "w:right", right)) {
    changed = true;
  }
  if (firstLine && setAttributeValue(indent, "w:firstLine", firstLine)) {
    changed = true;
  }
  return changed;
}

function setParagraphAlignment(paragraph: XmlElement, align: DocxBlockLayoutSpec["align"]): boolean {
  if (!align) {
    return false;
  }

  const document = paragraph.ownerDocument;
  if (!document) {
    return false;
  }

  const paragraphProperties = findOrCreateParagraphProperties(paragraph, document);
  const justification = findOrCreateChild(paragraphProperties, "w:jc", document);
  return setAttributeValue(justification, "w:val", align);
}

function setParagraphRunTypography(paragraph: XmlElement, spec: DocxBlockLayoutSpec): boolean {
  if (
    !spec.fontFamily
    && spec.fontSizePt === undefined
    && spec.fontWeight === undefined
    && spec.italic === undefined
    && spec.underline === undefined
    && spec.smallCaps === undefined
    && spec.color === undefined
  ) {
    return false;
  }

  const document = paragraph.ownerDocument;
  if (!document) {
    return false;
  }

  let changed = false;
  for (const child of elementChildren(paragraph)) {
    if (child.nodeName !== "w:r") {
      continue;
    }
    const runProperties = findOrCreateChild(child, "w:rPr", document, true);
    if (runHasCharacterStyle(runProperties)) {
      if (clearRunFontFamily(runProperties)) {
        changed = true;
      }
      if (clearRunFontSize(runProperties)) {
        changed = true;
      }
    } else {
      if (setRunFontFamily(runProperties, spec.fontFamily, document)) {
        changed = true;
      }
      if (setRunFontSize(runProperties, spec.fontSizePt, document)) {
        changed = true;
      }
    }
    if (setRunFontWeight(runProperties, spec.fontWeight, document)) {
      changed = true;
    }
    if (setRunItalic(runProperties, spec.italic, document)) {
      changed = true;
    }
    if (setRunUnderline(runProperties, spec.underline, document)) {
      changed = true;
    }
    if (setRunSmallCaps(runProperties, spec.smallCaps, document)) {
      changed = true;
    }
    if (setRunColor(runProperties, spec.color, document)) {
      changed = true;
    }
  }
  return changed;
}

function setStyleLineSpacing(paragraphProperties: XmlElement, lineSpacing: number | undefined, document: XmlDocument): boolean {
  const normalized = normalizeLineSpacing(lineSpacing);
  if (normalized === undefined) {
    return false;
  }
  const spacing = findOrCreateChild(paragraphProperties, "w:spacing", document);
  let changed = false;
  if (setAttributeValue(spacing, "w:line", String(Math.round(240 * normalized)))) {
    changed = true;
  }
  if (setAttributeValue(spacing, "w:lineRule", "auto")) {
    changed = true;
  }
  return changed;
}

function setStyleParagraphSpacing(
  paragraphProperties: XmlElement,
  before: string | undefined,
  after: string | undefined,
  document: XmlDocument
): boolean {
  const beforeTwips = toTwips(before);
  const afterTwips = toTwips(after);
  if (!beforeTwips && !afterTwips) {
    return false;
  }

  const spacing = findOrCreateChild(paragraphProperties, "w:spacing", document);
  let changed = false;
  if (beforeTwips && setAttributeValue(spacing, "w:before", beforeTwips)) {
    changed = true;
  }
  if (afterTwips && setAttributeValue(spacing, "w:after", afterTwips)) {
    changed = true;
  }
  return changed;
}

function setRunFontFamily(runProperties: XmlElement, fontFamily: string | undefined, document: XmlDocument): boolean {
  if (!fontFamily) {
    return false;
  }
  const fonts = findOrCreateChild(runProperties, "w:rFonts", document);
  let changed = false;
  if (setAttributeValue(fonts, "w:ascii", fontFamily)) {
    changed = true;
  }
  if (setAttributeValue(fonts, "w:hAnsi", fontFamily)) {
    changed = true;
  }
  if (setAttributeValue(fonts, "w:cs", fontFamily)) {
    changed = true;
  }
  return changed;
}

function clearRunFontFamily(runProperties: XmlElement): boolean {
  let changed = false;
  for (const child of [...elementChildren(runProperties)]) {
    if (child.nodeName !== "w:rFonts") {
      continue;
    }
    runProperties.removeChild(child);
    changed = true;
  }
  return changed;
}

function setRunFontSize(runProperties: XmlElement, fontSizePt: number | undefined, document: XmlDocument): boolean {
  if (fontSizePt === undefined || !Number.isFinite(fontSizePt) || fontSizePt <= 0) {
    return false;
  }
  const halfPoints = String(Math.round(fontSizePt * 2));
  let changed = false;
  const size = findOrCreateChild(runProperties, "w:sz", document);
  if (setAttributeValue(size, "w:val", halfPoints)) {
    changed = true;
  }
  const sizeCs = findOrCreateChild(runProperties, "w:szCs", document);
  if (setAttributeValue(sizeCs, "w:val", halfPoints)) {
    changed = true;
  }
  return changed;
}

function clearRunFontSize(runProperties: XmlElement): boolean {
  let changed = false;
  for (const child of [...elementChildren(runProperties)]) {
    if (child.nodeName !== "w:sz" && child.nodeName !== "w:szCs") {
      continue;
    }
    runProperties.removeChild(child);
    changed = true;
  }
  return changed;
}

function setRunFontWeight(
  runProperties: XmlElement,
  fontWeight: DocxBlockLayoutSpec["fontWeight"],
  document: XmlDocument
): boolean {
  if (fontWeight === undefined) {
    return false;
  }
  let changed = false;
  if (setBooleanRunProperty(runProperties, "w:b", fontWeight === "bold", document)) {
    changed = true;
  }
  if (setBooleanRunProperty(runProperties, "w:bCs", fontWeight === "bold", document)) {
    changed = true;
  }
  return changed;
}

function setRunItalic(
  runProperties: XmlElement,
  italic: DocxBlockLayoutSpec["italic"],
  document: XmlDocument
): boolean {
  if (italic === undefined) {
    return false;
  }
  let changed = false;
  if (setBooleanRunProperty(runProperties, "w:i", italic, document)) {
    changed = true;
  }
  if (setBooleanRunProperty(runProperties, "w:iCs", italic, document)) {
    changed = true;
  }
  return changed;
}

function setRunUnderline(
  runProperties: XmlElement,
  underline: DocxBlockLayoutSpec["underline"],
  document: XmlDocument
): boolean {
  if (underline === undefined) {
    return false;
  }
  const property = findOrCreateChild(runProperties, "w:u", document);
  return setAttributeValue(property, "w:val", underline ? "single" : "none");
}

function setRunSmallCaps(
  runProperties: XmlElement,
  smallCaps: DocxBlockLayoutSpec["smallCaps"],
  document: XmlDocument
): boolean {
  if (smallCaps === undefined) {
    return false;
  }
  return setBooleanRunProperty(runProperties, "w:smallCaps", smallCaps, document);
}

function setRunColor(
  runProperties: XmlElement,
  color: DocxBlockLayoutSpec["color"],
  document: XmlDocument
): boolean {
  if (!color) {
    return false;
  }
  const property = findOrCreateChild(runProperties, "w:color", document);
  let changed = false;
  if (setAttributeValue(property, "w:val", color)) {
    changed = true;
  }
  if (property.hasAttribute("w:themeColor")) {
    property.removeAttribute("w:themeColor");
    changed = true;
  }
  if (property.hasAttribute("w:themeTint")) {
    property.removeAttribute("w:themeTint");
    changed = true;
  }
  if (property.hasAttribute("w:themeShade")) {
    property.removeAttribute("w:themeShade");
    changed = true;
  }
  return changed;
}

function toSpacerAfterTwips(spec: DocxBlockLayoutSpec): string | undefined {
  const lines = spec.spacerLines;
  if (!lines || !Number.isInteger(lines) || lines < 2) {
    return undefined;
  }

  const fontSizePt = spec.fontSizePt && Number.isFinite(spec.fontSizePt) && spec.fontSizePt > 0
    ? spec.fontSizePt
    : DEFAULT_EM_IN_POINTS;
  const lineSpacing = normalizeLineSpacing(spec.lineSpacing) ?? 1.2;
  const lineHeightTwips = Math.round(fontSizePt * 20 * lineSpacing);
  return String(lineHeightTwips * (lines - 1));
}

function normalizeLineSpacing(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

function setBooleanRunProperty(
  runProperties: XmlElement,
  propertyName: string,
  enabled: boolean,
  document: XmlDocument
): boolean {
  const property = findOrCreateChild(runProperties, propertyName, document);
  return setAttributeValue(property, "w:val", enabled ? "1" : "0");
}

function runHasCharacterStyle(runProperties: XmlElement): boolean {
  return findFirstElement(runProperties, "w:rStyle") !== null;
}

function clearRunColor(runProperties: XmlElement): boolean {
  let changed = false;
  for (const child of [...elementChildren(runProperties)]) {
    if (child.nodeName !== "w:color") {
      continue;
    }
    runProperties.removeChild(child);
    changed = true;
  }
  return changed;
}

function findOrCreateNormalParagraphStyle(root: XmlElement, document: XmlDocument): XmlElement {
  for (const child of elementChildren(root)) {
    if (child.nodeName !== "w:style") {
      continue;
    }
    if (child.getAttribute("w:type") !== "paragraph") {
      continue;
    }
    if (child.getAttribute("w:styleId") === "Normal" || child.getAttribute("w:default") === "1") {
      return child;
    }
  }

  const style = document.createElement("w:style");
  style.setAttribute("w:type", "paragraph");
  style.setAttribute("w:styleId", "Normal");
  style.setAttribute("w:default", "1");

  const name = document.createElement("w:name");
  name.setAttribute("w:val", "Normal");
  style.appendChild(name);
  root.appendChild(style);
  return style;
}

function applyPandocBodyParagraphStyleDefaults(
  root: XmlElement,
  style: DocxDocumentStyleSpec,
  document: XmlDocument
): boolean {
  if (style.spaceBefore === undefined && style.spaceAfter === undefined) {
    return false;
  }

  let changed = false;
  for (const styleId of PANDOC_BODY_PARAGRAPH_STYLE_IDS) {
    const paragraphStyle = findParagraphStyleById(root, styleId);
    if (!paragraphStyle) {
      continue;
    }
    const paragraphProperties = findOrCreateChild(paragraphStyle, "w:pPr", document);
    if (setStyleParagraphSpacing(paragraphProperties, style.spaceBefore, style.spaceAfter, document)) {
      changed = true;
    }
  }

  return changed;
}

function applyPandocHeadingStyleDefaults(
  root: XmlElement,
  style: DocxDocumentStyleSpec,
  document: XmlDocument
): boolean {
  let changed = false;
  for (const styleId of PANDOC_HEADING_STYLE_IDS) {
    const paragraphStyle = findParagraphStyleById(root, styleId);
    if (!paragraphStyle) {
      continue;
    }
    const runProperties = findOrCreateChild(paragraphStyle, "w:rPr", document);
    if (setRunFontFamily(runProperties, style.fontFamily, document)) {
      changed = true;
    }
    if (clearRunColor(runProperties)) {
      changed = true;
    }
  }

  return changed;
}

function applyPandocHeadingCharacterStyleDefaults(
  root: XmlElement,
  style: DocxDocumentStyleSpec,
  document: XmlDocument
): boolean {
  let changed = false;

  for (const styleId of PANDOC_HEADING_CHARACTER_STYLE_IDS) {
    const headingStyle = findStyleById(root, styleId);
    if (!headingStyle) {
      continue;
    }

    const runProperties = findOrCreateChild(headingStyle, "w:rPr", document);
    if (setRunFontFamily(runProperties, style.fontFamily, document)) {
      changed = true;
    }
    if (clearRunColor(runProperties)) {
      changed = true;
    }
  }

  return changed;
}

function applyCharacterStyles(
  root: XmlElement,
  styles: DocxCharacterStyleSpec[],
  document: XmlDocument,
): boolean {
  let changed = false;
  for (const style of styles) {
    const element = findOrCreateCharacterStyle(root, style.styleId, document);
    const runProperties = findOrCreateChild(element, "w:rPr", document);
    if (setRunFontFamily(runProperties, style.fontFamily, document)) {
      changed = true;
    }
    if (setRunFontSize(runProperties, style.fontSizePt, document)) {
      changed = true;
    }
    if (setRunFontWeight(runProperties, style.fontWeight, document)) {
      changed = true;
    }
    if (setRunItalic(runProperties, style.italic, document)) {
      changed = true;
    }
    if (setRunUnderline(runProperties, style.underline, document)) {
      changed = true;
    }
    if (setRunSmallCaps(runProperties, style.smallCaps, document)) {
      changed = true;
    }
    if (setRunColor(runProperties, style.color, document)) {
      changed = true;
    }
  }
  return changed;
}

function findOrCreateCharacterStyle(root: XmlElement, styleId: string, document: XmlDocument): XmlElement {
  const existing = findStyleById(root, styleId);
  if (existing) {
    return existing;
  }

  const style = document.createElement("w:style");
  style.setAttribute("w:type", "character");
  style.setAttribute("w:styleId", styleId);
  style.setAttribute("w:customStyle", "1");

  const name = document.createElement("w:name");
  name.setAttribute("w:val", styleId);
  style.appendChild(name);

  root.appendChild(style);
  return style;
}

async function applyDocxPageTemplateToArchive(
  archive: JSZip,
  pageTemplate: DocxPageTemplateSpec,
): Promise<boolean> {
  const documentXml = archive.file(DOCUMENT_XML_PATH);
  const contentTypesXml = archive.file(CONTENT_TYPES_XML_PATH);
  if (!documentXml || !contentTypesXml) {
    return false;
  }

  const documentSource = await documentXml.async("string");
  const contentTypesSource = await contentTypesXml.async("string");
  const relsFile = archive.file(DOCUMENT_RELS_XML_PATH);
  const relsSource = relsFile
    ? await relsFile.async("string")
    : `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

  const documentModel = new DOMParser().parseFromString(documentSource, "application/xml");
  const relsModel = new DOMParser().parseFromString(relsSource, "application/xml");
  const contentTypesModel = new DOMParser().parseFromString(contentTypesSource, "application/xml");

  const documentRoot = documentModel.documentElement;
  const body = findFirstElement(documentRoot, "w:body");
  const relsRoot = relsModel.documentElement;
  const contentTypesRoot = contentTypesModel.documentElement;
  if (!documentRoot || !body || !relsRoot || !contentTypesRoot) {
    return false;
  }

  if (!documentRoot.getAttribute("xmlns:r")) {
    documentRoot.setAttribute("xmlns:r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships");
  }

  const sectPr = findOrCreateBodySectionProperties(body, documentModel);
  let changed = false;

  if (pageTemplate.header) {
    const headerRelId = ensureRelationship(
      relsRoot,
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header",
      "header1.xml",
      relsModel,
    );
    if (setSectionReference(sectPr, "w:headerReference", headerRelId, documentModel)) {
      changed = true;
    }
    archive.file(HEADER_XML_PATH, buildPageRegionPartXml(documentModel, pageTemplate.header, pageTemplate, "header"));
    if (ensureContentTypeOverride(
      contentTypesRoot,
      "/word/header1.xml",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml",
      contentTypesModel,
    )) {
      changed = true;
    }
    changed = true;
  }

  if (pageTemplate.footer) {
    const footerRelId = ensureRelationship(
      relsRoot,
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer",
      "footer1.xml",
      relsModel,
    );
    if (setSectionReference(sectPr, "w:footerReference", footerRelId, documentModel)) {
      changed = true;
    }
    archive.file(FOOTER_XML_PATH, buildPageRegionPartXml(documentModel, pageTemplate.footer, pageTemplate, "footer"));
    if (ensureContentTypeOverride(
      contentTypesRoot,
      "/word/footer1.xml",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml",
      contentTypesModel,
    )) {
      changed = true;
    }
    changed = true;
  }

  if (!changed) {
    return false;
  }

  archive.file(DOCUMENT_XML_PATH, new XMLSerializer().serializeToString(documentModel));
  archive.file(DOCUMENT_RELS_XML_PATH, new XMLSerializer().serializeToString(relsModel));
  archive.file(CONTENT_TYPES_XML_PATH, new XMLSerializer().serializeToString(contentTypesModel));
  return true;
}

function findOrCreateBodySectionProperties(body: XmlElement, document: XmlDocument): XmlElement {
  const existing = findFirstElement(body, "w:sectPr");
  if (existing) {
    return existing;
  }
  const sectPr = document.createElement("w:sectPr");
  body.appendChild(sectPr);
  return sectPr;
}

function ensureRelationship(
  relsRoot: XmlElement,
  type: string,
  target: string,
  document: XmlDocument,
): string {
  for (const child of elementChildren(relsRoot)) {
    if (child.getAttribute("Type") === type && child.getAttribute("Target") === target) {
      return child.getAttribute("Id") || "";
    }
  }

  const relationship = document.createElement("Relationship");
  const id = nextRelationshipId(relsRoot);
  relationship.setAttribute("Id", id);
  relationship.setAttribute("Type", type);
  relationship.setAttribute("Target", target);
  relsRoot.appendChild(relationship);
  return id;
}

function nextRelationshipId(relsRoot: XmlElement): string {
  let maxId = 0;
  for (const child of elementChildren(relsRoot)) {
    const id = child.getAttribute("Id");
    const match = id ? id.match(/^rId(\d+)$/) : null;
    if (match) {
      maxId = Math.max(maxId, Number(match[1]));
    }
  }
  return `rId${maxId + 1}`;
}

function ensureContentTypeOverride(
  root: XmlElement,
  partName: string,
  contentType: string,
  document: XmlDocument,
): boolean {
  for (const child of elementChildren(root)) {
    if (child.nodeName === "Override" && child.getAttribute("PartName") === partName) {
      return false;
    }
  }
  const override = document.createElement("Override");
  override.setAttribute("PartName", partName);
  override.setAttribute("ContentType", contentType);
  root.appendChild(override);
  return true;
}

function setSectionReference(
  sectPr: XmlElement,
  elementName: "w:headerReference" | "w:footerReference",
  relationshipId: string,
  document: XmlDocument,
): boolean {
  for (const child of [...elementChildren(sectPr)]) {
    if (child.nodeName === elementName && child.getAttribute("w:type") === "default") {
      if (child.getAttribute("r:id") === relationshipId) {
        return false;
      }
      child.setAttribute("r:id", relationshipId);
      return true;
    }
  }
  const reference = document.createElement(elementName);
  reference.setAttribute("w:type", "default");
  reference.setAttribute("r:id", relationshipId);
  sectPr.appendChild(reference);
  return true;
}

function buildPageRegionPartXml(
  sourceDocument: XmlDocument,
  region: DocxPageRegion,
  pageTemplate: DocxPageTemplateSpec,
  kind: "header" | "footer",
): string {
  const document = new DOMParser().parseFromString(
    kind === "header"
      ? `<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:hdr>`
      : `<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:ftr>`,
    "application/xml",
  );
  const root = document.documentElement;
  const paragraph = document.createElement("w:p");
  root.appendChild(paragraph);

  const defaults = {
    fontFamily: pageTemplate.defaultFontFamily,
    fontSizePt: pageTemplate.defaultFontSizePt,
    lineSpacing: pageTemplate.defaultLineSpacing,
  };
  appendPageRegionParagraph(document, sourceDocument, paragraph, region, defaults);

  return new XMLSerializer().serializeToString(document);
}

function appendPageRegionParagraph(
  document: XmlDocument,
  sourceDocument: XmlDocument,
  paragraph: XmlElement,
  region: DocxPageRegion,
  defaults: {
    fontFamily?: string;
    fontSizePt?: number;
    lineSpacing?: number;
  },
): void {
  const paragraphProperties = findOrCreateParagraphProperties(paragraph, document);
  if (defaults.lineSpacing !== undefined) {
    setParagraphLineSpacing(paragraph, defaults.lineSpacing);
  }

  const left = region.left || [];
  const center = region.center || [];
  const right = region.right || [];
  const hasLeft = left.length > 0;
  const hasCenter = center.length > 0;
  const hasRight = right.length > 0;
  const populatedCount = [hasLeft, hasCenter, hasRight].filter(Boolean).length;

  if (populatedCount <= 1) {
    const alignment = hasCenter ? "center" : hasRight ? "right" : "left";
    if (alignment !== "left") {
      const justification = findOrCreateChild(paragraphProperties, "w:jc", document);
      setAttributeValue(justification, "w:val", alignment);
    }
    appendRegionRuns(document, paragraph, hasLeft ? left : hasCenter ? center : right, defaults);
    return;
  }

  configurePageRegionTabs(
    document,
    paragraphProperties,
    resolveUsablePageWidthTwips(sourceDocument),
    hasCenter,
    hasRight,
  );

  if (hasLeft) {
    appendRegionRuns(document, paragraph, left, defaults);
  }
  if (hasCenter) {
    appendTabRun(document, paragraph);
    appendRegionRuns(document, paragraph, center, defaults);
  }
  if (hasRight) {
    appendTabRun(document, paragraph);
    appendRegionRuns(document, paragraph, right, defaults);
  }
}

function configurePageRegionTabs(
  document: XmlDocument,
  paragraphProperties: XmlElement,
  usableWidthTwips: number,
  includeCenter: boolean,
  includeRight: boolean,
): void {
  const tabs = findOrCreateChild(paragraphProperties, "w:tabs", document);
  for (const child of [...elementChildren(tabs)]) {
    tabs.removeChild(child);
  }

  if (includeCenter) {
    const centerTab = document.createElement("w:tab");
    centerTab.setAttribute("w:val", "center");
    centerTab.setAttribute("w:pos", String(Math.round(usableWidthTwips / 2)));
    tabs.appendChild(centerTab);
  }

  if (includeRight) {
    const rightTab = document.createElement("w:tab");
    rightTab.setAttribute("w:val", "right");
    rightTab.setAttribute("w:pos", String(usableWidthTwips));
    tabs.appendChild(rightTab);
  }
}

function resolveUsablePageWidthTwips(document: XmlDocument): number {
  const body = findFirstElement(document.documentElement, "w:body");
  const sectionProperties = findFirstElement(body, "w:sectPr");
  if (!sectionProperties) {
    return DEFAULT_USABLE_PAGE_WIDTH_TWIPS;
  }

  const pageSize = findFirstElement(sectionProperties, "w:pgSz");
  const pageMargins = findFirstElement(sectionProperties, "w:pgMar");
  const pageWidth = parsePositiveInteger(pageSize?.getAttribute("w:w"));
  const marginLeft = parsePositiveInteger(pageMargins?.getAttribute("w:left"));
  const marginRight = parsePositiveInteger(pageMargins?.getAttribute("w:right"));

  if (pageWidth === undefined || marginLeft === undefined || marginRight === undefined) {
    return DEFAULT_USABLE_PAGE_WIDTH_TWIPS;
  }

  const usableWidth = pageWidth - marginLeft - marginRight;
  return usableWidth > 0 ? usableWidth : DEFAULT_USABLE_PAGE_WIDTH_TWIPS;
}

function parsePositiveInteger(value: string | null | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function appendTabRun(document: XmlDocument, paragraph: XmlElement): void {
  const run = document.createElement("w:r");
  const tab = document.createElement("w:tab");
  run.appendChild(tab);
  paragraph.appendChild(run);
}

function appendRegionRuns(
  document: XmlDocument,
  paragraph: XmlElement,
  nodes: DocxPageRegionNode[],
  inherited: {
    fontFamily?: string;
    fontSizePt?: number;
    fontWeight?: "normal" | "bold";
    italic?: boolean;
    underline?: boolean;
    smallCaps?: boolean;
    color?: string;
  },
): void {
  for (const node of nodes) {
    if (node.kind === "text") {
      paragraph.appendChild(createStyledTextRun(document, node.value, inherited));
      continue;
    }
    if (node.kind === "pageNumber") {
      appendPageNumberField(document, paragraph, inherited);
      continue;
    }
    appendRegionRuns(document, paragraph, node.children, mergeRunStyle(inherited, node));
  }
}

function createStyledTextRun(
  document: XmlDocument,
  value: string,
  style: {
    fontFamily?: string;
    fontSizePt?: number;
    fontWeight?: "normal" | "bold";
    italic?: boolean;
    underline?: boolean;
    smallCaps?: boolean;
    color?: string;
  },
): XmlElement {
  const run = document.createElement("w:r");
  const runProperties = findOrCreateChild(run, "w:rPr", document, true);
  setRunFontFamily(runProperties, style.fontFamily, document);
  setRunFontSize(runProperties, style.fontSizePt, document);
  setRunFontWeight(runProperties, style.fontWeight, document);
  setRunItalic(runProperties, style.italic, document);
  setRunUnderline(runProperties, style.underline, document);
  setRunSmallCaps(runProperties, style.smallCaps, document);
  setRunColor(runProperties, style.color, document);
  const text = document.createElement("w:t");
  if (/^\s|\s$|\s{2,}/.test(value)) {
    text.setAttribute("xml:space", "preserve");
  }
  text.appendChild(document.createTextNode(value));
  run.appendChild(text);
  return run;
}

function appendPageNumberField(
  document: XmlDocument,
  paragraph: XmlElement,
  style: {
    fontFamily?: string;
    fontSizePt?: number;
    fontWeight?: "normal" | "bold";
    italic?: boolean;
    underline?: boolean;
    smallCaps?: boolean;
    color?: string;
  },
): void {
  paragraph.appendChild(createFieldRun(document, "begin", undefined, style));
  paragraph.appendChild(createFieldRun(document, undefined, " PAGE ", style, true));
  paragraph.appendChild(createFieldRun(document, "separate", undefined, style));
  paragraph.appendChild(createStyledTextRun(document, "1", style));
  paragraph.appendChild(createFieldRun(document, "end", undefined, style));
}

function createFieldRun(
  document: XmlDocument,
  fieldType: "begin" | "separate" | "end" | undefined,
  instruction: string | undefined,
  style: {
    fontFamily?: string;
    fontSizePt?: number;
    fontWeight?: "normal" | "bold";
    italic?: boolean;
    underline?: boolean;
    smallCaps?: boolean;
    color?: string;
  },
  preserveSpace = false,
): XmlElement {
  const run = document.createElement("w:r");
  const runProperties = findOrCreateChild(run, "w:rPr", document, true);
  setRunFontFamily(runProperties, style.fontFamily, document);
  setRunFontSize(runProperties, style.fontSizePt, document);
  setRunFontWeight(runProperties, style.fontWeight, document);
  setRunItalic(runProperties, style.italic, document);
  setRunUnderline(runProperties, style.underline, document);
  setRunSmallCaps(runProperties, style.smallCaps, document);
  setRunColor(runProperties, style.color, document);

  if (fieldType) {
    const fldChar = document.createElement("w:fldChar");
    fldChar.setAttribute("w:fldCharType", fieldType);
    run.appendChild(fldChar);
    return run;
  }

  const instr = document.createElement("w:instrText");
  if (preserveSpace) {
    instr.setAttribute("xml:space", "preserve");
  }
  instr.appendChild(document.createTextNode(instruction || ""));
  run.appendChild(instr);
  return run;
}

function mergeRunStyle(
  base: {
    fontFamily?: string;
    fontSizePt?: number;
    fontWeight?: "normal" | "bold";
    italic?: boolean;
    underline?: boolean;
    smallCaps?: boolean;
    color?: string;
  },
  override: {
    fontFamily?: string;
    fontSizePt?: number;
    fontWeight?: "normal" | "bold";
    italic?: boolean;
    underline?: boolean;
    smallCaps?: boolean;
    color?: string;
  },
) {
  return {
    fontFamily: override.fontFamily !== undefined ? override.fontFamily : base.fontFamily,
    fontSizePt: override.fontSizePt !== undefined ? override.fontSizePt : base.fontSizePt,
    fontWeight: override.fontWeight !== undefined ? override.fontWeight : base.fontWeight,
    italic: override.italic !== undefined ? override.italic : base.italic,
    underline: override.underline !== undefined ? override.underline : base.underline,
    smallCaps: override.smallCaps !== undefined ? override.smallCaps : base.smallCaps,
    color: override.color !== undefined ? override.color : base.color,
  };
}

function findParagraphStyleById(root: XmlElement, styleId: string): XmlElement | undefined {
  for (const child of elementChildren(root)) {
    if (child.nodeName !== "w:style") {
      continue;
    }
    if (child.getAttribute("w:type") !== "paragraph") {
      continue;
    }
    if (child.getAttribute("w:styleId") === styleId) {
      return child;
    }
  }

  return undefined;
}

function findStyleById(root: XmlElement, styleId: string): XmlElement | undefined {
  for (const child of elementChildren(root)) {
    if (child.nodeName !== "w:style") {
      continue;
    }
    if (child.getAttribute("w:styleId") === styleId) {
      return child;
    }
  }

  return undefined;
}

function findOrCreateParagraphProperties(paragraph: XmlElement, document: XmlDocument): XmlElement {
  const existing = findFirstElement(paragraph, "w:pPr");
  if (existing) {
    return existing;
  }

  const paragraphProperties = document.createElement("w:pPr");
  const firstChild = firstElementChild(paragraph);
  if (firstChild) {
    paragraph.insertBefore(paragraphProperties, firstChild);
  } else {
    paragraph.appendChild(paragraphProperties);
  }
  return paragraphProperties;
}

function findOrCreateChild(parent: XmlElement, name: string, document: XmlDocument, afterParagraphProps = false): XmlElement {
  const existing = findFirstElement(parent, name);
  if (existing) {
    return existing;
  }
  const child = document.createElement(name);
  if (afterParagraphProps) {
    const firstChild = firstElementChild(parent);
    if (firstChild) {
      parent.insertBefore(child, firstChild);
      return child;
    }
  }
  parent.appendChild(child);
  return child;
}

function setAttributeValue(element: XmlElement, name: string, value: string): boolean {
  if (element.getAttribute(name) === value) {
    return false;
  }
  element.setAttribute(name, value);
  return true;
}

function findFirstElement(parent: XmlElement | null | undefined, name: string): XmlElement | null {
  if (!parent) {
    return null;
  }
  for (const child of elementChildren(parent)) {
    if (child.nodeName === name) {
      return child;
    }
  }
  return null;
}

function firstElementChild(parent: XmlElement): XmlElement | null {
  for (const child of elementChildren(parent)) {
    return child;
  }
  return null;
}

function elementChildren(parent: XmlElement): XmlElement[] {
  const children: XmlElement[] = [];
  for (let index = 0; index < parent.childNodes.length; index += 1) {
    const child = parent.childNodes.item(index);
    if (child?.nodeType === ELEMENT_NODE) {
      children.push(child as XmlElement);
    }
  }
  return children;
}

function toTwips(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(pt|in|em)$/);
  if (!match) {
    return undefined;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(amount)) {
    return undefined;
  }

  let points: number;
  if (unit === "pt") {
    points = amount;
  } else if (unit === "in") {
    points = amount * 72;
  } else {
    points = amount * DEFAULT_EM_IN_POINTS;
  }

  return String(Math.round(points * 20));
}
