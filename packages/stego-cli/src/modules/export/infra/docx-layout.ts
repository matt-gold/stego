import fs from "node:fs";
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { DocxBlockLayoutSpec } from "@stego-labs/shared/domain/layout";

const DOCUMENT_XML_PATH = "word/document.xml";
const ELEMENT_NODE = 1;
const DEFAULT_EM_IN_POINTS = 12;
type XmlDocument = ReturnType<DOMParser["parseFromString"]>;
type XmlElement = XmlDocument["documentElement"];

export async function applyDocxLayout(docxPath: string, specs: DocxBlockLayoutSpec[] = []): Promise<void> {
  if (specs.length === 0) {
    return;
  }
  const archive = await JSZip.loadAsync(fs.readFileSync(docxPath));
  const documentXml = archive.file(DOCUMENT_XML_PATH);
  if (!documentXml) {
    return;
  }

  const source = await documentXml.async("string");
  const rewritten = applyDocxLayoutToDocumentXml(source, specs);
  if (rewritten === source) {
    return;
  }

  archive.file(DOCUMENT_XML_PATH, rewritten);
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

function findOrCreateChild(parent: XmlElement, name: string, document: XmlDocument): XmlElement {
  const existing = findFirstElement(parent, name);
  if (existing) {
    return existing;
  }
  const child = document.createElement(name);
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
