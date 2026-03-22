export const PRESENTATION_MARKER_PREFIX = "stego-layout-";

export function createPresentationMarkerId(index: number): string {
  return `${PRESENTATION_MARKER_PREFIX}${index}`;
}

export function isPresentationMarkerId(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith(PRESENTATION_MARKER_PREFIX);
}
