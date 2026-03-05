export const COMMENT_ID_PATTERN = /^CMT-\d{4,}$/;

export function normalizeCommentId(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidCommentId(value: string): boolean {
  return COMMENT_ID_PATTERN.test(normalizeCommentId(value));
}

export function normalizeCommentStatus(value: string): "open" | "resolved" | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "open" || normalized === "resolved") {
    return normalized;
  }
  return null;
}
