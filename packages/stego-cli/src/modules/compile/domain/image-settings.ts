import path from "node:path";

const GLOBAL_IMAGE_KEYS = new Set(["width", "height", "classes", "id", "attrs", "layout", "align"]);

export type ImageStyle = {
  width?: string;
  height?: string;
  id?: string;
  classes?: string[];
  attrs?: Record<string, string>;
  layout?: "block" | "inline";
  align?: "left" | "center" | "right";
};

export type ImageSettings = {
  global: ImageStyle;
  overrides: Map<string, ImageStyle>;
  warnings: string[];
};

export type RewriteChapterImagesInput = {
  body: string;
  chapterPath: string;
  projectRoot: string;
  projectMeta: Record<string, unknown>;
  frontmatter: Record<string, unknown>;
};

export function parseProjectImageDefaults(projectMeta: Record<string, unknown>): ImageSettings {
  const warnings: string[] = [];
  const global: ImageStyle = {};
  const overrides = new Map<string, ImageStyle>();
  const rawImages = projectMeta.images;

  if (rawImages == null) {
    return { global, overrides, warnings };
  }

  if (!isPlainObject(rawImages)) {
    warnings.push("Project 'images' must be an object.");
    return { global, overrides, warnings };
  }

  for (const [key, value] of Object.entries(rawImages)) {
    if (GLOBAL_IMAGE_KEYS.has(key)) {
      applyImageStyleField(global, key, value, `project.images.${key}`, warnings);
      continue;
    }

    warnings.push(
      `Project image defaults do not support key 'images.${key}'. Use only width, height, classes, id, attrs, layout, align in stego-project.json.`
    );
  }

  return { global, overrides, warnings };
}

export function parseManuscriptImageOverrides(frontmatter: Record<string, unknown>): ImageSettings {
  const warnings: string[] = [];
  const global: ImageStyle = {};
  const overrides = new Map<string, ImageStyle>();
  const rawImages = frontmatter.images;

  if (rawImages == null) {
    return { global, overrides, warnings };
  }

  if (!isPlainObject(rawImages)) {
    warnings.push("Metadata 'images' must be an object.");
    return { global, overrides, warnings };
  }

  for (const [key, value] of Object.entries(rawImages)) {
    if (GLOBAL_IMAGE_KEYS.has(key)) {
      warnings.push(
        `Manuscript frontmatter 'images.${key}' is reserved for project defaults. Put defaults in stego-project.json 'images.${key}'.`
      );
      continue;
    }

    if (!isPlainObject(value)) {
      warnings.push(
        `Metadata 'images.${key}' must be an object of style keys (width, height, classes, id, attrs, layout, align).`
      );
      continue;
    }

    const style: ImageStyle = {};
    for (const [styleKey, styleValue] of Object.entries(value)) {
      applyImageStyleField(style, styleKey, styleValue, `images.${key}.${styleKey}`, warnings);
    }

    overrides.set(normalizePathKey(key), style);
  }

  return { global, overrides, warnings };
}

export function rewriteMarkdownImagesForChapter(input: RewriteChapterImagesInput): string {
  const projectDefaults = parseProjectImageDefaults(input.projectMeta);
  const manuscriptOverrides = parseManuscriptImageOverrides(input.frontmatter);
  const settings: ImageSettings = {
    global: projectDefaults.global,
    overrides: manuscriptOverrides.overrides,
    warnings: [...projectDefaults.warnings, ...manuscriptOverrides.warnings]
  };
  if (isEmptyStyle(settings.global) && settings.overrides.size === 0) {
    return input.body;
  }

  const lineEnding = input.body.includes("\r\n") ? "\r\n" : "\n";
  const lines = input.body.split(/\r?\n/);
  const rewritten: string[] = [];
  let openFence: { marker: string; length: number } | null = null;
  const chapterDir = path.dirname(input.chapterPath);
  const assetsDir = path.resolve(input.projectRoot, "assets");

  for (const line of lines) {
    const trimmed = line.trimStart();
    const fenceMatch = trimmed.match(/^(```+|~~~+)/);

    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      const length = fenceMatch[1].length;
      if (!openFence) {
        openFence = { marker, length };
      } else if (openFence.marker === marker && length >= openFence.length) {
        openFence = null;
      }
      rewritten.push(line);
      continue;
    }

    if (openFence) {
      rewritten.push(line);
      continue;
    }

    rewritten.push(
      rewriteImagesInLine(line, {
        settings,
        chapterDir,
        projectRoot: input.projectRoot,
        assetsDir
      })
    );
  }

  return rewritten.join(lineEnding);
}

function rewriteImagesInLine(
  line: string,
  context: {
    settings: ImageSettings;
    chapterDir: string;
    projectRoot: string;
    assetsDir: string;
  }
): string {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)(\s*\{[^{}]*\})?/g;

  return line.replace(imageRegex, (_full, altText: string, destination: string, inlineAttrText: string | undefined) => {
    const parsedDestination = extractDestinationTarget(destination);
    if (!parsedDestination || isExternalTarget(parsedDestination) || parsedDestination.startsWith("#")) {
      return _full;
    }

    const cleanTarget = stripQueryAndAnchor(parsedDestination);
    if (!cleanTarget) {
      return _full;
    }

    const resolvedPath = path.resolve(context.chapterDir, cleanTarget);
    if (!isPathInside(resolvedPath, context.assetsDir)) {
      return _full;
    }

    const relativeToProject = path.relative(context.projectRoot, resolvedPath);
    if (!relativeToProject || relativeToProject.startsWith("..") || path.isAbsolute(relativeToProject)) {
      return _full;
    }

    const projectKey = normalizePathKey(relativeToProject);
    const effectiveStyle = buildEffectiveStyle(context.settings, projectKey);
    if (isEmptyStyle(effectiveStyle)) {
      return _full;
    }

    const inlineStyle = parseInlineAttrList(inlineAttrText?.trim());
    const merged = mergeStyle(effectiveStyle, inlineStyle);
    const renderedAttrList = renderAttrList(merged);

    return `![${altText}](${destination})${renderedAttrList}`;
  });
}

function extractDestinationTarget(value: string): string {
  let target = value.trim();
  if (target.startsWith("<") && target.endsWith(">")) {
    target = target.slice(1, -1).trim();
  }

  return target
    .split(/\s+"/)[0]
    .split(/\s+'/)[0]
    .trim();
}

function stripQueryAndAnchor(target: string): string {
  return target.split("#")[0].split("?")[0].trim();
}

function buildEffectiveStyle(settings: ImageSettings, projectRelativeKey: string): ImageStyle {
  const merged = cloneStyle(settings.global);
  const override = settings.overrides.get(projectRelativeKey);
  if (override) {
    return mergeStyle(merged, override);
  }
  return merged;
}

function cloneStyle(style: ImageStyle): ImageStyle {
  return {
    width: style.width,
    height: style.height,
    id: style.id,
    classes: style.classes ? [...style.classes] : undefined,
    attrs: style.attrs ? { ...style.attrs } : undefined,
    layout: style.layout,
    align: style.align
  };
}

function mergeStyle(base: ImageStyle, next: ImageStyle): ImageStyle {
  const merged = cloneStyle(base);

  if (next.id) {
    merged.id = next.id;
  }

  if (next.classes && next.classes.length > 0) {
    merged.classes = [...next.classes];
  }

  if (next.width) {
    merged.width = next.width;
    if (merged.attrs && Object.hasOwn(merged.attrs, "width")) {
      merged.attrs.width = next.width;
    }
  }

  if (next.height) {
    merged.height = next.height;
    if (merged.attrs && Object.hasOwn(merged.attrs, "height")) {
      merged.attrs.height = next.height;
    }
  }

  if (next.layout) {
    merged.layout = next.layout;
    if (merged.attrs && Object.hasOwn(merged.attrs, "data-layout")) {
      merged.attrs["data-layout"] = next.layout;
    }
  }

  if (next.align) {
    merged.align = next.align;
    if (merged.attrs && Object.hasOwn(merged.attrs, "data-align")) {
      merged.attrs["data-align"] = next.align;
    }
  }

  const nextAttrs = next.attrs ?? {};
  const mergedAttrs = { ...(merged.attrs ?? {}) };
  for (const [key, value] of Object.entries(nextAttrs)) {
    mergedAttrs[key] = value;
  }
  merged.attrs = Object.keys(mergedAttrs).length > 0 ? mergedAttrs : undefined;

  return merged;
}

function parseInlineAttrList(rawAttrText: string | undefined): ImageStyle {
  if (!rawAttrText) {
    return {};
  }

  const text = rawAttrText.trim();
  if (!text.startsWith("{") || !text.endsWith("}")) {
    return {};
  }

  const body = text.slice(1, -1).trim();
  if (!body) {
    return {};
  }

  const style: ImageStyle = {};
  const attrs: Record<string, string> = {};
  const classes: string[] = [];
  for (const token of splitAttrTokens(body)) {
    if (!token) {
      continue;
    }

    if (token.startsWith("#")) {
      const id = token.slice(1).trim();
      if (id) {
        style.id = id;
      }
      continue;
    }

    if (token.startsWith(".")) {
      const className = token.slice(1).trim();
      if (className) {
        classes.push(className);
      }
      continue;
    }

    const equalsIndex = token.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = token.slice(0, equalsIndex).trim();
    const value = stripWrappingQuotes(token.slice(equalsIndex + 1).trim());
    if (!key || !value) {
      continue;
    }

    if (key === "width") {
      style.width = value;
      continue;
    }
    if (key === "height") {
      style.height = value;
      continue;
    }

    if (key === "layout") {
      if (value === "block" || value === "inline") {
        style.layout = value;
      }
      continue;
    }

    if (key === "align") {
      if (value === "left" || value === "center" || value === "right") {
        style.align = value;
      }
      continue;
    }

    attrs[key] = value;
  }

  if (classes.length > 0) {
    style.classes = classes;
  }
  if (Object.keys(attrs).length > 0) {
    style.attrs = attrs;
  }

  return style;
}

function splitAttrTokens(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      current += char;
      if (char === quote && value[index - 1] !== "\\") {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function renderAttrList(style: ImageStyle): string {
  const attrs = { ...(style.attrs ?? {}) };
  if (style.layout && !Object.hasOwn(attrs, "data-layout")) {
    attrs["data-layout"] = style.layout;
  }
  if (style.align && !Object.hasOwn(attrs, "data-align")) {
    attrs["data-align"] = style.align;
  }
  if (style.width && !Object.hasOwn(attrs, "width")) {
    attrs.width = style.width;
  }
  if (style.height && !Object.hasOwn(attrs, "height")) {
    attrs.height = style.height;
  }

  const tokens: string[] = [];
  if (style.id) {
    tokens.push(`#${style.id}`);
  }
  for (const className of style.classes ?? []) {
    if (className.trim().length > 0) {
      tokens.push(`.${className.trim()}`);
    }
  }

  if (Object.hasOwn(attrs, "width")) {
    tokens.push(`width=${formatAttrValue(attrs.width)}`);
    delete attrs.width;
  }
  if (Object.hasOwn(attrs, "height")) {
    tokens.push(`height=${formatAttrValue(attrs.height)}`);
    delete attrs.height;
  }

  const remainingKeys = Object.keys(attrs).sort((a, b) => a.localeCompare(b));
  for (const key of remainingKeys) {
    tokens.push(`${key}=${formatAttrValue(attrs[key])}`);
  }

  if (tokens.length === 0) {
    return "";
  }

  return `{${tokens.join(" ")}}`;
}

function formatAttrValue(value: string): string {
  const normalized = value.trim();
  if (/^[A-Za-z0-9._%:/+-]+$/.test(normalized)) {
    return normalized;
  }
  return `"${normalized.replaceAll('"', '\\"')}"`;
}

function applyImageStyleField(
  style: ImageStyle,
  key: string,
  value: unknown,
  metadataPath: string,
  warnings: string[]
): void {
  if (key === "width" || key === "height" || key === "id") {
    if (!isStyleScalar(value)) {
      warnings.push(`Metadata '${metadataPath}' must be a scalar value.`);
      return;
    }

    const normalized = String(value).trim();
    if (!normalized) {
      return;
    }

    if (key === "width") {
      style.width = normalized;
    } else if (key === "height") {
      style.height = normalized;
    } else {
      style.id = normalized;
    }
    return;
  }

  if (key === "classes") {
    const classes = normalizeClasses(value);
    if (!classes) {
      warnings.push(`Metadata '${metadataPath}' must be a string or array of strings.`);
      return;
    }

    if (classes.length > 0) {
      style.classes = classes;
    }
    return;
  }

  if (key === "attrs") {
    if (!isPlainObject(value)) {
      warnings.push(`Metadata '${metadataPath}' must be an object of scalar values.`);
      return;
    }

    const attrs: Record<string, string> = {};
    for (const [attrKey, attrValue] of Object.entries(value)) {
      if (!isStyleScalar(attrValue)) {
        warnings.push(`Metadata '${metadataPath}.${attrKey}' must be a scalar value.`);
        continue;
      }

      const normalizedValue = String(attrValue).trim();
      if (!normalizedValue) {
        continue;
      }
      attrs[attrKey] = normalizedValue;
    }

    if (Object.keys(attrs).length > 0) {
      style.attrs = attrs;
    }
    return;
  }

  if (key === "layout") {
    if (value !== "block" && value !== "inline") {
      warnings.push(`Metadata '${metadataPath}' must be either 'block' or 'inline'.`);
      return;
    }
    style.layout = value;
    return;
  }

  if (key === "align") {
    if (value !== "left" && value !== "center" && value !== "right") {
      warnings.push(`Metadata '${metadataPath}' must be one of: left, center, right.`);
      return;
    }
    style.align = value;
    return;
  }

  warnings.push(
    `Unsupported image style key '${key}' in '${metadataPath}'. Allowed keys: width, height, classes, id, attrs, layout, align.`
  );
}

function normalizeClasses(value: unknown): string[] | null {
  if (typeof value === "string") {
    return value.split(/\s+/).map((entry) => entry.trim()).filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const classes: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      return null;
    }
    const normalized = entry.trim();
    if (!normalized) {
      continue;
    }
    classes.push(normalized);
  }

  return classes;
}

function normalizePathKey(value: string): string {
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
  return normalized;
}

function stripWrappingQuotes(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}

function isStyleScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isEmptyStyle(style: ImageStyle): boolean {
  return !style.width
    && !style.height
    && !style.id
    && !style.layout
    && !style.align
    && (!style.classes || style.classes.length === 0)
    && (!style.attrs || Object.keys(style.attrs).length === 0);
}

function isExternalTarget(target: string): boolean {
  return target.startsWith("http://")
    || target.startsWith("https://")
    || target.startsWith("mailto:")
    || target.startsWith("tel:")
    || target.startsWith("data:");
}

function isPathInside(candidatePath: string, parentPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  if (!relative) {
    return true;
  }
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
