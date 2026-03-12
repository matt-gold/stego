import { filterItems } from "../internal/filtering.js";
import { groupItems, splitItems } from "../internal/grouping.js";
import { sortItems } from "../internal/sorting.js";
class EngineCollection {
    #items;
    constructor(items) {
        this.#items = [...items];
    }
    all() {
        return [...this.#items];
    }
    where(predicate) {
        return new EngineCollection(filterItems(this.#items, predicate));
    }
    sortBy(selector) {
        return new EngineCollection(sortItems(this.#items, selector));
    }
    groupBy(selector) {
        return groupItems(this.#items, selector);
    }
    splitBy(selector) {
        return splitItems(this.#items, selector);
    }
    map(mapper) {
        return this.#items.map(mapper);
    }
}
export function createCollection(items) {
    return new EngineCollection(items);
}
//# sourceMappingURL=createCollection.js.map