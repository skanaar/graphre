import {
  cloneDeep,
  find,
  flatten,
  flattenDeep,
  forEach,
  forIn,
  map,
  mapValues,
  max,
  merge,
  min,
  minBy,
  pick,
  range,
  reduce,
  sortBy,
  zipObject
} from "lodash";

const idCounter: Record<string, number> = {};

export default {
  cloneDeep,
  find,
  flatten,
  flattenDeep,
  forEach,
  forIn,
  has(object: any, key: string): boolean {
    return object != null && object.hasOwnProperty(key)
  },
  last<T>(array: T[]): T {
    const length = array == null ? 0 : array.length
    return length ? array[length - 1] : undefined
  },
  map,
  mapValues,
  max,
  merge,
  min,
  minBy,
  pick,
  range,
  reduce,
  sortBy,
  uniqueId(prefix: string): string {
    if (!idCounter[prefix]) {
      idCounter[prefix] = 0
    }
    const id = ++idCounter[prefix]
    return `${prefix}${id}`
  },
  values<T>(object: Record<string, T>): T[] {
    return object ? Object.keys(object).map(e => object[e]) : [];
  },
  zipObject,
  
  array<T>(count: number, factory: () => T): T[] {
    var output = []
    for(var i=0; i<count; i++) output.push(factory());
    return output;
  }
};
