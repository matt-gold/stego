import type {
  BodyStyle,
  ColorValue,
  HeadingLevel,
  HeadingStyle,
  HeadingStyleMap,
} from "../ir/index.ts";
import type { TemplateCapability } from "@stego-labs/shared/domain/templates";

export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

export const BODY_STYLE_CAPABILITIES = {
  spaceBefore: "spacing",
  spaceAfter: "spacing",
  insetLeft: "inset",
  insetRight: "inset",
  firstLineIndent: "indent",
  align: "align",
  fontFamily: "fontFamily",
  fontSize: "fontSize",
  lineSpacing: "lineSpacing",
} as const satisfies Partial<Record<keyof BodyStyle, TemplateCapability>>;

export const HEADING_STYLE_CAPABILITIES = {
  spaceBefore: "spacing",
  spaceAfter: "spacing",
  insetLeft: "inset",
  insetRight: "inset",
  align: "align",
  fontFamily: "fontFamily",
  fontSize: "fontSize",
  lineSpacing: "lineSpacing",
  fontWeight: "fontWeight",
  italic: "italic",
  underline: "underline",
  smallCaps: "smallCaps",
  color: "textColor",
} as const satisfies Partial<Record<keyof HeadingStyle, TemplateCapability>>;

export const SPAN_STYLE_CAPABILITIES = {
  fontFamily: "fontFamily",
  fontSize: "fontSize",
  fontWeight: "fontWeight",
  italic: "italic",
  underline: "underline",
  smallCaps: "smallCaps",
  color: "textColor",
} as const;

export function mergeBodyStyle(
  base?: BodyStyle,
  override?: BodyStyle,
): BodyStyle | undefined {
  return mergeDefinedStyle(base, override);
}

export function mergeHeadingStyle(
  base?: HeadingStyle,
  override?: HeadingStyle,
): HeadingStyle | undefined {
  return mergeDefinedStyle(base, override);
}

export function mergeHeadingStyleMap(
  base?: HeadingStyleMap,
  override?: HeadingStyleMap,
): HeadingStyleMap | undefined {
  const result: Partial<Record<HeadingLevel, HeadingStyle>> = {};

  for (const level of HEADING_LEVELS) {
    const merged = mergeHeadingStyle(base?.[level], override?.[level]);
    if (merged) {
      result[level] = merged;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

export function resolveHeadingDefaults(
  level: HeadingLevel,
  bodyStyle?: BodyStyle,
  headingStyle?: HeadingStyle,
  headingStyles?: HeadingStyleMap,
): HeadingStyle | undefined {
  const seeded = bodyStyle?.fontFamily
    ? ({ fontFamily: bodyStyle.fontFamily } satisfies HeadingStyle)
    : undefined;
  return mergeHeadingStyle(
    mergeHeadingStyle(seeded, headingStyle),
    headingStyles?.[level],
  );
}

export function normalizeHexColor(
  value: string | ColorValue | undefined,
): ColorValue | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) {
    return undefined;
  }

  const hex = match[1].toUpperCase();
  if (hex.length === 6) {
    return `#${hex}` as ColorValue;
  }

  return `#${hex
    .split("")
    .map((char) => `${char}${char}`)
    .join("")}` as ColorValue;
}

export function toDocxColor(value: string | ColorValue | undefined): string | undefined {
  const normalized = normalizeHexColor(value);
  return normalized ? normalized.slice(1) : undefined;
}

function mergeDefinedStyle<T extends object>(
  base?: Partial<T>,
  override?: Partial<T>,
): Partial<T> | undefined {
  const result: Record<string, unknown> = {};

  for (const source of [base, override]) {
    if (!source) {
      continue;
    }
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
  }

  return Object.keys(result).length > 0 ? (result as Partial<T>) : undefined;
}
