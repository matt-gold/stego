import type { SizeValue } from "../../../ir/index.ts";

export function formatSizeValue(value: SizeValue | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  return typeof value === "number" ? `${value}pt` : value;
}
