import type { SpacingValue } from "../../../ir/index.ts";

export function formatSpacingValue(value: SpacingValue | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  return typeof value === "number" ? `${value}pt` : value;
}
