import fs from "node:fs";
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { DocxBlockLayoutSpec, DocxDocumentStyleSpec } from "@stego-labs/shared/domain/layout";

const DOCUMENT_XML_PATH = "word/document.xml";
const STYLES_XML_PATH = "word/styles.xml";
const ELEMENT_NODE = 1;
const DEFAULT_EM_IN_POINTS = 12;
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
};

export async function applyDocxLayout(
  docxPath: string,
  input: DocxBlockLayoutSpec[] | DocxLayoutPostprocess = []
): Promise<void> {
  const postprocess = normalizePostprocess(input);
  if ((postprocess.blockLayouts?.length || 0) === 0 && !postprocess.documentStyle) {
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

  if (postprocess.documentStyle) {
    const stylesXml = archive.file(STYLES_XML_PATH);
    const source = stylesXml
      ? await stylesXml.async("string")
      : `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:styles>`;
    const rewritten = applyDocxDocumentStyleToStylesXml(source, postprocess.documentStyle);
    if (rewritten !== source) {
      archive.file(STYLES_XML_PATH, rewritten);
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
      if (group.spec.pageBreak && insertStandalonePageBreak(body, group.spec.bookmarkName, document)) {
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
  if (
    !style
    || (
      !style.fontFamily
      && style.fontSizePt === undefined
      && style.lineSpacing === undefined
      && style.parSpaceBefore === undefined
      && style.parSpaceAfter === undefined
    )
  ) {
    return source;
  }

  const document = new DOMParser().parseFromString(source, "application/xml");
  const root = document.documentElement;
  if (!root) {
    return source;
  }

  const normalStyle = findOrCreateNormalParagraphStyle(root, document);
  const paragraphProperties = findOrCreateChild(normalStyle, "w:pPr", document);
  const runProperties = findOrCreateChild(normalStyle, "w:rPr", document);

  let changed = false;
  if (setStyleLineSpacing(paragraphProperties, style.lineSpacing, document)) {
    changed = true;
  }
  if (setStyleParagraphSpacing(paragraphProperties, style.parSpaceBefore, style.parSpaceAfter, document)) {
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

function insertStandalonePageBreak(body: XmlElement, bookmarkName: string, document: XmlDocument): boolean {
  for (let index = 0; index < body.childNodes.length; index += 1) {
    const child = body.childNodes.item(index);
    if (child?.nodeType !== ELEMENT_NODE) {
      continue;
    }
    const element = child as XmlElement;
    if (element.nodeName !== "w:bookmarkStart" || element.getAttribute("w:name") !== bookmarkName) {
      continue;
    }

    const pageBreakParagraph = document.createElement("w:p");
    const run = document.createElement("w:r");
    const breakElement = document.createElement("w:br");
    breakElement.setAttribute("w:type", "page");
    run.appendChild(breakElement);
    pageBreakParagraph.appendChild(run);

    const insertBefore = element.nextSibling;
    if (insertBefore) {
      body.insertBefore(pageBreakParagraph, insertBefore);
    } else {
      body.appendChild(pageBreakParagraph);
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
  if (lineSpacing === undefined) {
    return false;
  }
  const document = paragraph.ownerDocument;
  if (!document) {
    return false;
  }

  const paragraphProperties = findOrCreateParagraphProperties(paragraph, document);
  const spacing = findOrCreateChild(paragraphProperties, "w:spacing", document);
  const lineTwips = String(Math.round(240 * lineSpacing));
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
  if (!spec.fontFamily && spec.fontSizePt === undefined) {
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
    if (setRunFontFamily(runProperties, spec.fontFamily, document)) {
      changed = true;
    }
    if (setRunFontSize(runProperties, spec.fontSizePt, document)) {
      changed = true;
    }
  }
  return changed;
}

function setStyleLineSpacing(paragraphProperties: XmlElement, lineSpacing: number | undefined, document: XmlDocument): boolean {
  if (lineSpacing === undefined) {
    return false;
  }
  const spacing = findOrCreateChild(paragraphProperties, "w:spacing", document);
  let changed = false;
  if (setAttributeValue(spacing, "w:line", String(Math.round(240 * lineSpacing)))) {
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
  if (style.parSpaceBefore === undefined && style.parSpaceAfter === undefined) {
    return false;
  }

  let changed = false;
  for (const styleId of PANDOC_BODY_PARAGRAPH_STYLE_IDS) {
    const paragraphStyle = findParagraphStyleById(root, styleId);
    if (!paragraphStyle) {
      continue;
    }
    const paragraphProperties = findOrCreateChild(paragraphStyle, "w:pPr", document);
    if (setStyleParagraphSpacing(paragraphProperties, style.parSpaceBefore, style.parSpaceAfter, document)) {
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
  if (!style.fontFamily) {
    return false;
  }

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
  if (!style.fontFamily) {
    return false;
  }

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
