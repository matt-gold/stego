type SortSelector<T> = keyof T | ((item: T) => string | number | undefined);

export function sortItems<T>(items: T[], selector: SortSelector<T>): T[] {
  const next = [...items];
  next.sort((a, b) => compareValues(resolveSortValue(a, selector), resolveSortValue(b, selector)));
  return next;
}

function resolveSortValue<T>(item: T, selector: SortSelector<T>): string | number | undefined {
  if (typeof selector === "function") {
    return selector(item);
  }
  const raw = item[selector];
  if (typeof raw === "string" || typeof raw === "number") {
    return raw;
  }
  return undefined;
}

function compareValues(a: string | number | undefined, b: string | number | undefined): number {
  if (a == null && b == null) {
    return 0;
  }
  if (a == null) {
    return 1;
  }
  if (b == null) {
    return -1;
  }
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return String(a).localeCompare(String(b));
}
