const COMMENT_ID_REGEX = /^CMT-\d{4,}$/i;

export function isCommentIdentifier(value: string): boolean {
  return COMMENT_ID_REGEX.test(value.trim());
}

export function normalizeCommentIdentifier(value: string): string {
  return value.trim().toUpperCase();
}
