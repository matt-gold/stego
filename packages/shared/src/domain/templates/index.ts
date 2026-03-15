export const EXPORT_TARGETS = ["md", "docx", "pdf", "epub"] as const;
export const PRESENTATION_TARGETS = ["docx", "pdf", "epub"] as const;
export const TEMPLATE_FILE_PATTERN = /\.template\.(tsx|ts|jsx|js)$/i;

export type ExportTarget = (typeof EXPORT_TARGETS)[number];
export type PresentationTarget = (typeof PRESENTATION_TARGETS)[number];

export const TARGET_CAPABILITIES = {
  docx: {
    pageLayout: true,
    pageTemplate: true,
    pageNumber: true,
    keepTogether: true,
    pageBreak: true,
    spacing: true,
    inset: true,
    indent: true,
    align: true,
    imageAlign: true,
    imageLayout: true
  },
  pdf: {
    pageLayout: true,
    pageTemplate: true,
    pageNumber: true,
    keepTogether: true,
    pageBreak: true,
    spacing: true,
    inset: true,
    indent: true,
    align: true,
    imageAlign: true,
    imageLayout: true
  },
  epub: {
    pageLayout: false,
    pageTemplate: false,
    pageNumber: false,
    keepTogether: false,
    pageBreak: false,
    spacing: false,
    inset: false,
    indent: false,
    align: false,
    imageAlign: false,
    imageLayout: false
  }
} as const;

export type TemplateCapability = keyof (typeof TARGET_CAPABILITIES)["docx"];

export function isExportTarget(value: string): value is ExportTarget {
  return EXPORT_TARGETS.includes(value as ExportTarget);
}

export function isPresentationTarget(value: string): value is PresentationTarget {
  return PRESENTATION_TARGETS.includes(value as PresentationTarget);
}

export function isTemplateFilename(value: string): boolean {
  return TEMPLATE_FILE_PATTERN.test(value);
}

export function getTemplateNameFromFilename(value: string): string {
  const match = value.match(/^(.*)\.template\.(tsx|ts|jsx|js)$/i);
  return match?.[1] ?? value;
}

export function parseDeclaredTemplateTargets(source: string): readonly PresentationTarget[] | null {
  const optionsSource = extractDefineTemplateOptionsSource(source);
  if (!optionsSource) {
    return null;
  }

  const targetsSource = extractTargetsArraySource(optionsSource);
  if (!targetsSource) {
    return null;
  }

  const targets: PresentationTarget[] = [];
  const seen = new Set<PresentationTarget>();
  for (const valueMatch of targetsSource.matchAll(/["'`]([^"'`]+)["'`]/g)) {
    const value = valueMatch[1].trim();
    if (!isPresentationTarget(value) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    targets.push(value);
  }

  return targets;
}

function extractDefineTemplateOptionsSource(source: string): string | null {
  let searchStart = 0;
  while (searchStart < source.length) {
    const callIndex = findTokenOutsideSyntax(source, "defineTemplate", searchStart);
    if (callIndex < 0) {
      return null;
    }

    let cursor = skipWhitespace(source, callIndex + "defineTemplate".length);
    if (source[cursor] === "<") {
      const genericEnd = findMatchingDelimiter(source, cursor, "<", ">");
      if (genericEnd < 0) {
        return null;
      }
      cursor = skipWhitespace(source, genericEnd + 1);
    }

    if (source[cursor] === "(") {
      return readFirstCallArgument(source, cursor + 1);
    }

    searchStart = callIndex + "defineTemplate".length;
  }

  return null;
}

function extractTargetsArraySource(optionsSource: string): string | null {
  const trimmed = optionsSource.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }

  const body = trimmed.slice(1, -1);
  let cursor = 0;
  while (cursor < body.length) {
    cursor = skipTrivia(body, cursor);
    const property = readTopLevelProperty(body, cursor);
    if (!property) {
      break;
    }
    cursor = property.nextIndex;
    if (property.key !== "targets") {
      continue;
    }
    const valueStart = skipTrivia(body, property.valueStart);
    if (body[valueStart] !== "[") {
      return null;
    }
    const arrayEnd = findMatchingDelimiter(body, valueStart, "[", "]");
    if (arrayEnd < 0) {
      return null;
    }
    return body.slice(valueStart + 1, arrayEnd);
  }

  return null;
}

function readFirstCallArgument(source: string, start: number): string | null {
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;

  for (let index = start; index < source.length; index += 1) {
    const nextIndex = skipLiteralOrComment(source, index);
    if (nextIndex !== index) {
      index = nextIndex - 1;
      continue;
    }

    const char = source[index];
    if (char === "(") {
      parenDepth += 1;
      continue;
    }
    if (char === ")") {
      if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
        const argument = source.slice(start, index).trim();
        return argument.length > 0 ? argument : null;
      }
      parenDepth -= 1;
      continue;
    }
    if (char === "{") {
      braceDepth += 1;
      continue;
    }
    if (char === "}") {
      braceDepth -= 1;
      continue;
    }
    if (char === "[") {
      bracketDepth += 1;
      continue;
    }
    if (char === "]") {
      bracketDepth -= 1;
      continue;
    }
    if (char === "," && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      const argument = source.slice(start, index).trim();
      return argument.length > 0 ? argument : null;
    }
  }

  return null;
}

function readTopLevelProperty(
  source: string,
  start: number
): { key: string; valueStart: number; nextIndex: number } | null {
  let index = skipTrivia(source, start);
  if (index >= source.length) {
    return null;
  }

  let key: string | null = null;
  const char = source[index];
  if (char === "'" || char === "\"" || char === "`") {
    const stringEnd = findStringEnd(source, index, char);
    if (stringEnd < 0) {
      return null;
    }
    key = source.slice(index + 1, stringEnd);
    index = stringEnd + 1;
  } else if (isIdentifierStart(char)) {
    const identifierEnd = readIdentifierEnd(source, index);
    key = source.slice(index, identifierEnd);
    index = identifierEnd;
  }

  if (!key) {
    return null;
  }

  index = skipTrivia(source, index);
  if (source[index] !== ":") {
    return null;
  }

  const valueStart = index + 1;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  for (index = valueStart; index < source.length; index += 1) {
    const nextIndex = skipLiteralOrComment(source, index);
    if (nextIndex !== index) {
      index = nextIndex - 1;
      continue;
    }

    const current = source[index];
    if (current === "(") {
      parenDepth += 1;
      continue;
    }
    if (current === ")") {
      parenDepth -= 1;
      continue;
    }
    if (current === "{") {
      braceDepth += 1;
      continue;
    }
    if (current === "}") {
      if (braceDepth === 0 && parenDepth === 0 && bracketDepth === 0) {
        return { key, valueStart, nextIndex: index };
      }
      braceDepth -= 1;
      continue;
    }
    if (current === "[") {
      bracketDepth += 1;
      continue;
    }
    if (current === "]") {
      bracketDepth -= 1;
      continue;
    }
    if (current === "," && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      return { key, valueStart, nextIndex: index + 1 };
    }
  }

  return { key, valueStart, nextIndex: source.length };
}

function findTokenOutsideSyntax(source: string, token: string, start = 0): number {
  for (let index = start; index <= source.length - token.length; index += 1) {
    const nextIndex = skipLiteralOrComment(source, index);
    if (nextIndex !== index) {
      index = nextIndex - 1;
      continue;
    }
    if (!source.startsWith(token, index)) {
      continue;
    }
    const before = index === 0 ? "" : source[index - 1];
    const after = source[index + token.length] ?? "";
    if ((before && isIdentifierPart(before)) || (after && isIdentifierPart(after))) {
      continue;
    }
    return index;
  }
  return -1;
}

function findMatchingDelimiter(source: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const nextIndex = skipLiteralOrComment(source, index);
    if (nextIndex !== index) {
      index = nextIndex - 1;
      continue;
    }
    const char = source[index];
    if (char === open) {
      depth += 1;
      continue;
    }
    if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function skipWhitespace(source: string, start: number): number {
  let index = start;
  while (index < source.length && /\s/.test(source[index])) {
    index += 1;
  }
  return index;
}

function skipTrivia(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    const nextIndex = skipLiteralOrComment(source, index, { skipStrings: false });
    if (nextIndex !== index) {
      index = nextIndex;
      continue;
    }
    if (!/\s|,/.test(source[index])) {
      break;
    }
    index += 1;
  }
  return index;
}

function skipLiteralOrComment(
  source: string,
  start: number,
  options: { skipStrings?: boolean } = {}
): number {
  const skipStrings = options.skipStrings ?? true;
  const current = source[start];
  if (current === "/" && source[start + 1] === "/") {
    let index = start + 2;
    while (index < source.length && source[index] !== "\n") {
      index += 1;
    }
    return index;
  }
  if (current === "/" && source[start + 1] === "*") {
    let index = start + 2;
    while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
      index += 1;
    }
    return Math.min(index + 2, source.length);
  }
  if (skipStrings && (current === "'" || current === "\"" || current === "`")) {
    const end = findStringEnd(source, start, current);
    return end < 0 ? source.length : end + 1;
  }
  return start;
}

function findStringEnd(source: string, start: number, quote: string): number {
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === "\\") {
      index += 1;
      continue;
    }
    if (quote === "`" && source[index] === "$" && source[index + 1] === "{") {
      const expressionEnd = findMatchingDelimiter(source, index + 1, "{", "}");
      if (expressionEnd < 0) {
        return -1;
      }
      index = expressionEnd;
      continue;
    }
    if (source[index] === quote) {
      return index;
    }
  }
  return -1;
}

function isIdentifierStart(value: string): boolean {
  return /[A-Za-z_$]/.test(value);
}

function isIdentifierPart(value: string): boolean {
  return /[A-Za-z0-9_$]/.test(value);
}

function readIdentifierEnd(source: string, start: number): number {
  let index = start;
  while (index < source.length && isIdentifierPart(source[index])) {
    index += 1;
  }
  return index;
}

export function inferSupportedTemplateTargets(
  templateName: string,
  declaredTargets: readonly PresentationTarget[] | null
): readonly ExportTarget[] {
  const supported: ExportTarget[] = [];
  if (templateName === "book") {
    supported.push("md");
  }
  for (const target of declaredTargets ?? []) {
    if (!supported.includes(target)) {
      supported.push(target);
    }
  }
  return supported;
}
