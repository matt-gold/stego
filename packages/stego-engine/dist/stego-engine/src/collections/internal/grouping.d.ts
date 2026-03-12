import type { Group, GroupSelector, SplitGroup } from "../public/types.ts";
export declare function groupItems<T>(items: T[], selector: GroupSelector<T>): Group<T>[];
export declare function splitItems<T>(items: T[], selector: GroupSelector<T>): SplitGroup<T>[];
export declare function resolveGroupValue<T>(item: T, selector: GroupSelector<T>): string | undefined;
//# sourceMappingURL=grouping.d.ts.map