export const IMAGE_STYLE_KEYS = ["width", "height", "classes", "id", "attrs", "layout", "align"] as const;
export const IMAGE_GLOBAL_KEYS = new Set<string>(IMAGE_STYLE_KEYS);

export type ImageLayout = "block" | "inline";
export type ImageAlign = "left" | "center" | "right";

export type ImageStyle = {
  width?: string;
  height?: string;
  id?: string;
  classes?: string[];
  attrs?: Record<string, string>;
  layout?: ImageLayout;
  align?: ImageAlign;
};

export function asPlainRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function normalizeImageScalar(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    return undefined;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeImageClasses(value: unknown): string[] | undefined {
  if (typeof value === "string") {
    const classes = value
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return classes;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const classes: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      return undefined;
    }
    const normalized = entry.trim();
    if (!normalized) {
      continue;
    }
    classes.push(normalized);
  }
  return classes;
}

export function normalizeImageAttrs(value: unknown): Record<string, string> | undefined {
  const record = asPlainRecord(value);
  if (!record) {
    return undefined;
  }

  const attrs: Record<string, string> = {};
  for (const [key, raw] of Object.entries(record)) {
    const normalized = normalizeImageScalar(raw);
    if (!normalized) {
      continue;
    }
    attrs[key] = normalized;
  }

  return Object.keys(attrs).length > 0 ? attrs : undefined;
}

export function cloneImageStyle(style: ImageStyle | undefined): ImageStyle {
  return {
    width: style?.width,
    height: style?.height,
    id: style?.id,
    classes: style?.classes ? [...style.classes] : undefined,
    attrs: style?.attrs ? { ...style.attrs } : undefined,
    layout: style?.layout,
    align: style?.align
  };
}

export function mergeImageStyles(base: ImageStyle, override: ImageStyle): ImageStyle {
  const merged = cloneImageStyle(base);

  if (override.width) {
    merged.width = override.width;
  }
  if (override.height) {
    merged.height = override.height;
  }
  if (override.id) {
    merged.id = override.id;
  }
  if (override.layout) {
    merged.layout = override.layout;
  }
  if (override.align) {
    merged.align = override.align;
  }
  if (override.classes && override.classes.length > 0) {
    merged.classes = [...override.classes];
  }

  const attrs = { ...(merged.attrs ?? {}) };
  for (const [key, value] of Object.entries(override.attrs ?? {})) {
    attrs[key] = value;
  }
  merged.attrs = Object.keys(attrs).length > 0 ? attrs : undefined;

  return merged;
}

export function isImageStyleEmpty(style: ImageStyle | undefined): boolean {
  if (!style) {
    return true;
  }
  return !style.width
    && !style.height
    && !style.id
    && !style.layout
    && !style.align
    && (!style.classes || style.classes.length === 0)
    && (!style.attrs || Object.keys(style.attrs).length === 0);
}

export function parseImageStyle(value: unknown): ImageStyle | undefined {
  const record = asPlainRecord(value);
  if (!record) {
    return undefined;
  }

  const style: ImageStyle = {};
  for (const [key, raw] of Object.entries(record)) {
    if (key === "width" || key === "height" || key === "id") {
      const normalized = normalizeImageScalar(raw);
      if (normalized) {
        style[key] = normalized;
      }
      continue;
    }

    if (key === "layout") {
      if (raw === "block" || raw === "inline") {
        style.layout = raw;
      }
      continue;
    }

    if (key === "align") {
      if (raw === "left" || raw === "center" || raw === "right") {
        style.align = raw;
      }
      continue;
    }

    if (key === "classes") {
      const normalized = normalizeImageClasses(raw);
      if (normalized) {
        style.classes = normalized;
      }
      continue;
    }

    if (key === "attrs") {
      const normalized = normalizeImageAttrs(raw);
      if (normalized) {
        style.attrs = normalized;
      }
      continue;
    }
  }

  const layoutFromAttrs = style.attrs?.["data-layout"];
  if (!style.layout && (layoutFromAttrs === "block" || layoutFromAttrs === "inline")) {
    style.layout = layoutFromAttrs;
  }
  const alignFromAttrs = style.attrs?.["data-align"];
  if (!style.align && (alignFromAttrs === "left" || alignFromAttrs === "center" || alignFromAttrs === "right")) {
    style.align = alignFromAttrs;
  }

  return isImageStyleEmpty(style) ? undefined : style;
}

export function normalizeImagePathKey(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

export function extractImageDestinationTarget(value: string): string {
  let target = value.trim();
  if (target.startsWith("<") && target.endsWith(">")) {
    target = target.slice(1, -1).trim();
  }

  return target
    .split(/\s+"/)[0]
    .split(/\s+'/)[0]
    .trim();
}

export function stripImageQueryAndAnchor(target: string): string {
  return target.split("#")[0].split("?")[0].trim();
}

export function isExternalImageTarget(target: string): boolean {
  return target.startsWith("http://")
    || target.startsWith("https://")
    || target.startsWith("mailto:")
    || target.startsWith("tel:")
    || target.startsWith("data:");
}

export function inferEffectiveImageLayout(style: ImageStyle): ImageLayout | undefined {
  return style.layout ?? (style.align ? "block" : undefined);
}
