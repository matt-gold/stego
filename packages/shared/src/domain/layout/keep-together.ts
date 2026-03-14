export const KEEP_TOGETHER_BOOKMARK_PREFIX = "stego-keep-together-";

export function createKeepTogetherBookmarkName(index: number): string {
  return `${KEEP_TOGETHER_BOOKMARK_PREFIX}${index}`;
}

export function isKeepTogetherBookmarkName(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith(KEEP_TOGETHER_BOOKMARK_PREFIX);
}
