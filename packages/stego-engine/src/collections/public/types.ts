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

export type GroupSelector<T> = (item: T) => string | undefined;
