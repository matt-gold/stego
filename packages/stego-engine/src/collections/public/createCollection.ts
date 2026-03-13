import { filterItems } from "../internal/filtering.ts";
import { groupItems, splitItems } from "../internal/grouping.ts";
import { sortItems } from "../internal/sorting.ts";
import type { Collection, Group, GroupSelector, SortSelector, SplitGroup } from "./types.ts";

class EngineCollection<T> implements Collection<T> {
  readonly #items: T[];

  constructor(items: T[]) {
    this.#items = [...items];
  }

  public all(): T[] {
    return [...this.#items];
  }

  public where(predicate: (item: T) => boolean): Collection<T> {
    return new EngineCollection(filterItems(this.#items, predicate));
  }

  public sortBy(selector: SortSelector<T>): Collection<T> {
    return new EngineCollection(sortItems(this.#items, selector));
  }

  public groupBy(selector: GroupSelector<T>): Group<T>[] {
    return groupItems(this.#items, selector);
  }

  public splitBy(selector: GroupSelector<T>): SplitGroup<T>[] {
    return splitItems(this.#items, selector);
  }

  public map<U>(mapper: (item: T) => U): U[] {
    return this.#items.map(mapper);
  }
}

export function createCollection<T>(items: T[]): Collection<T> {
  return new EngineCollection(items);
}
