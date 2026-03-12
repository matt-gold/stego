export type Group<T> = {
  key: string;
  value: string;
  items: T[];
  first: T | undefined;
};

export type SplitGroup<T> = {
  key: string | undefined;
  value: string | undefined;
  items: T[];
  first: T;
};

export type GroupSelector<T> = string | ((item: T) => string | undefined);
export type SortSelector<T> = keyof T | ((item: T) => string | number | undefined);

export type Collection<T> = {
  all(): T[];
  where(predicate: (item: T) => boolean): Collection<T>;
  sortBy(selector: SortSelector<T>): Collection<T>;
  groupBy(selector: GroupSelector<T>): Group<T>[];
  splitBy(selector: GroupSelector<T>): SplitGroup<T>[];
  map<U>(mapper: (item: T) => U): U[];
};
