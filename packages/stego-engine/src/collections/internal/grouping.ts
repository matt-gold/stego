import type { Group, GroupSelector, SplitGroup } from "../public/types.ts";

export function groupItems<T>(items: T[], selector: GroupSelector<T>): Group<T>[] {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const resolved = resolveGroupValue(item, selector);
    if (!resolved) {
      continue;
    }
    const bucket = grouped.get(resolved) ?? [];
    bucket.push(item);
    grouped.set(resolved, bucket);
  }

  return [...grouped.entries()].map(([value, groupedItems]) => ({
    key: value,
    value,
    items: groupedItems,
    first: groupedItems[0]
  }));
}

export function splitItems<T>(items: T[], selector: GroupSelector<T>): SplitGroup<T>[] {
  const groups: SplitGroup<T>[] = [];
  let activeValue: string | undefined;

  for (const item of items) {
    const resolved = resolveGroupValue(item, selector);
    const currentValue = resolved ?? activeValue;
    const previous = groups[groups.length - 1];
    if (previous && previous.value === currentValue) {
      previous.items.push(item);
      if (resolved) {
        activeValue = resolved;
      }
      continue;
    }

    if (resolved) {
      activeValue = resolved;
    }
    groups.push({
      key: currentValue,
      value: currentValue,
      items: [item],
      first: item
    });
  }

  return groups;
}

export function resolveGroupValue<T>(item: T, selector: GroupSelector<T>): string | undefined {
  const raw = selector(item);

  if (raw == null) {
    return undefined;
  }

  const normalized = String(raw).trim();
  return normalized.length > 0 ? normalized : undefined;
}
