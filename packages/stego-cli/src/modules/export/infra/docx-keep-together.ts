import fs from "node:fs";
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { isKeepTogetherBookmarkName } from "@stego-labs/shared/domain/layout";

const DOCUMENT_XML_PATH = "word/document.xml";
const ELEMENT_NODE = 1;
type XmlDocument = ReturnType<DOMParser["parseFromString"]>;
type XmlElement = XmlDocument["documentElement"];

export async function applyKeepTogetherToDocx(docxPath: string): Promise<void> {
  const archive = await JSZip.loadAsync(fs.readFileSync(docxPath));
  const documentXml = archive.file(DOCUMENT_XML_PATH);
  if (!documentXml) {
    return;
  }

  const source = await documentXml.async("string");
  const rewritten = applyKeepTogetherToDocumentXml(source);
  if (rewritten === source) {
    return;
  }

  archive.file(DOCUMENT_XML_PATH, rewritten);
  const output = await archive.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(docxPath, output);
}

export function applyKeepTogetherToDocumentXml(source: string): string {
  const document = new DOMParser().parseFromString(source, "application/xml");
  const body = findFirstElement(document.documentElement, "w:body");
  if (!body) {
    return source;
  }

  const groups: XmlElement[][] = [];
  const activeGroups = new Map<string, XmlElement[]>();

  for (const child of elementChildren(body)) {
    if (child.nodeName === "w:bookmarkStart") {
      const name = child.getAttribute("w:name");
      const id = child.getAttribute("w:id");
      if (id && isKeepTogetherBookmarkName(name)) {
        const group: XmlElement[] = [];
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
        group.push(child);
      }
    }
  }

  let changed = false;
  for (const group of groups) {
    const paragraphs = uniqueParagraphs(group);
    if (paragraphs.length === 0) {
      continue;
    }
    for (let index = 0; index < paragraphs.length; index += 1) {
      const paragraph = paragraphs[index];
      if (ensureParagraphProperty(paragraph, "w:keepLines")) {
        changed = true;
      }
      if (index < paragraphs.length - 1) {
        if (ensureParagraphProperty(paragraph, "w:keepNext")) {
          changed = true;
        }
      }
    }
  }

  if (!changed) {
    return source;
  }

  return new XMLSerializer().serializeToString(document);
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

function ensureParagraphProperty(paragraph: XmlElement, propertyName: string): boolean {
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
