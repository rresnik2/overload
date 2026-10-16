// Structural sharing: keep the previous reference wherever the new value is deeply equal, so memoized components and effects see
// "no change" after a database re-read returns fresh but identical objects. Handles plain objects, arrays and Maps; anything else
// (Dates, class instances, functions) is compared by identity.

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== "object" || v === null) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
};

/** `prev` when `next` is deeply equal to it, else `next` with every unchanged branch replaced by its `prev` counterpart. */
export function replaceEqualDeep<T>(prev: unknown, next: T): T {
  if (Object.is(prev, next)) return next;

  if (Array.isArray(prev) && Array.isArray(next)) {
    let same = prev.length === next.length;
    const out: unknown[] = next.map((item, i) => {
      const shared = i < prev.length ? replaceEqualDeep(prev[i], item) : item;
      if (!Object.is(shared, prev[i])) same = false;
      return shared;
    });
    return (same ? prev : out) as T;
  }

  if (prev instanceof Map && next instanceof Map) {
    let same = prev.size === next.size;
    const out = new Map<unknown, unknown>();
    for (const [key, value] of next) {
      const had = prev.has(key);
      const shared = had ? replaceEqualDeep(prev.get(key), value) : value;
      if (!had || !Object.is(shared, prev.get(key))) same = false;
      out.set(key, shared);
    }
    return (same ? prev : out) as T;
  }

  if (isPlainObject(prev) && isPlainObject(next)) {
    const nextKeys = Object.keys(next);
    let same = Object.keys(prev).length === nextKeys.length;
    const out: Record<string, unknown> = {};
    for (const key of nextKeys) {
      const had = Object.hasOwn(prev, key);
      const shared = had ? replaceEqualDeep(prev[key], next[key]) : next[key];
      if (!had || !Object.is(shared, prev[key])) same = false;
      out[key] = shared;
    }
    return (same ? prev : out) as T;
  }

  return next;
}
