import path from "node:path";
import {
  IMAGE_GLOBAL_KEYS,
  asPlainRecord,
  cloneImageStyle,
  extractImageDestinationTarget,
  inferEffectiveImageLayout,
  isExternalImageTarget,
  isImageStyleEmpty,
  mergeImageStyles,
  normalizeImageAttrs,
  normalizeImageClasses,
  normalizeImagePathKey,
  normalizeImageScalar,
  stripImageQueryAndAnchor,
  type ImageStyle
} from "./style.ts";

export type ImageSettings = {
  global: ImageStyle;
  overrides: Map<string, ImageStyle>;
  warnings: string[];
};

export type RewriteMarkdownImagesInput = {
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
  const imagesRecord = asPlainRecord(rawImages);

  if (rawImages == null) {
    return { global, overrides, warnings };
  }

  if (!imagesRecord) {
    warnings.push("Project 'images' must be an object.");
    return { global, overrides, warnings };
  }

  for (const [key, value] of Object.entries(imagesRecord)) {
    if (IMAGE_GLOBAL_KEYS.has(key)) {
      applyImageStyleField(global, key, value, `images.${key}`, warnings);
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
  const imagesRecord = asPlainRecord(rawImages);

  if (rawImages == null) {
    return { global, overrides, warnings };
  }

  if (!imagesRecord) {
    warnings.push("Metadata 'images' must be an object.");
    return { global, overrides, warnings };
  }

  for (const [key, value] of Object.entries(imagesRecord)) {
    if (IMAGE_GLOBAL_KEYS.has(key)) {
      warnings.push(
        `Manuscript frontmatter 'images.${key}' is reserved for project defaults. Put defaults in stego-project.json 'images.${key}'.`
      );
      continue;
    }

    const styleRecord = asPlainRecord(value);
    if (!styleRecord) {
      warnings.push(
        `Metadata 'images.${key}' must be an object of style keys (width, height, classes, id, attrs, layout, align).`
      );
      continue;
    }

    const style: ImageStyle = {};
    for (const [styleKey, styleValue] of Object.entries(styleRecord)) {
      applyImageStyleField(style, styleKey, styleValue, `images.${key}.${styleKey}`, warnings);
    }

    overrides.set(normalizeImagePathKey(key), style);
  }

  return { global, overrides, warnings };
}

export function rewriteMarkdownImagesForChapter(input: RewriteMarkdownImagesInput): string {
  const projectDefaults = parseProjectImageDefaults(input.projectMeta);
  const manuscriptOverrides = parseManuscriptImageOverrides(input.frontmatter);
  const settings: ImageSettings = {
    global: projectDefaults.global,
    overrides: manuscriptOverrides.overrides,
    warnings: [...projectDefaults.warnings, ...manuscriptOverrides.warnings]
  };
  if (isImageStyleEmpty(settings.global) && settings.overrides.size === 0) {
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
    const parsedDestination = extractImageDestinationTarget(destination);
    if (!parsedDestination || isExternalImageTarget(parsedDestination) || parsedDestination.startsWith("#")) {
      return _full;
    }

    const cleanTarget = stripImageQueryAndAnchor(parsedDestination);
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

    const projectKey = normalizeImagePathKey(relativeToProject);
    const effectiveStyle = buildEffectiveStyle(context.settings, projectKey);
    if (isImageStyleEmpty(effectiveStyle)) {
      return _full;
    }

    const inlineStyle = parseInlineAttrList(inlineAttrText?.trim());
    const merged = mergeStyle(effectiveStyle, inlineStyle);
    const renderedAttrList = renderAttrList(merged);

    return `![${altText}](${destination})${renderedAttrList}`;
  });
}

function buildEffectiveStyle(settings: ImageSettings, projectRelativeKey: string): ImageStyle {
  const merged = cloneImageStyle(settings.global);
  const override = settings.overrides.get(projectRelativeKey);
  if (override) {
    return mergeStyle(merged, override);
  }
  return merged;
}

function mergeStyle(base: ImageStyle, next: ImageStyle): ImageStyle {
  const merged = mergeImageStyles(base, next);

  if (next.width && merged.attrs && Object.hasOwn(merged.attrs, "width")) {
    merged.attrs.width = next.width;
  }

  if (next.height && merged.attrs && Object.hasOwn(merged.attrs, "height")) {
    merged.attrs.height = next.height;
  }

  if (next.layout && merged.attrs && Object.hasOwn(merged.attrs, "data-layout")) {
    merged.attrs["data-layout"] = next.layout;
  }

  if (next.align && merged.attrs && Object.hasOwn(merged.attrs, "data-align")) {
    merged.attrs["data-align"] = next.align;
  }

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
  const effectiveLayout = inferEffectiveImageLayout(style);
  if (effectiveLayout && !Object.hasOwn(attrs, "data-layout")) {
    attrs["data-layout"] = effectiveLayout;
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
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      warnings.push(`Metadata '${metadataPath}' must be a scalar value.`);
      return;
    }

    const normalized = normalizeImageScalar(value);
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
    const classes = normalizeImageClasses(value);
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
    const attrsRecord = asPlainRecord(value);
    if (!attrsRecord) {
      warnings.push(`Metadata '${metadataPath}' must be an object of scalar values.`);
      return;
    }

    for (const [attrKey, attrValue] of Object.entries(attrsRecord)) {
      if (typeof attrValue !== "string" && typeof attrValue !== "number" && typeof attrValue !== "boolean") {
        warnings.push(`Metadata '${metadataPath}.${attrKey}' must be a scalar value.`);
      }
    }

    const attrs = normalizeImageAttrs(attrsRecord);
    if (attrs && Object.keys(attrs).length > 0) {
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

function stripWrappingQuotes(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}

function isPathInside(candidatePath: string, parentPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  if (!relative) {
    return true;
  }
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}
