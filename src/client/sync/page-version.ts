// The server version the open server-rendered page was rendered at, as reported by its `SyncVersionStamp`.
// Module-level (not React state): the refresh hook reads it from sync callbacks, and nothing renders from it.
const versions = new Map<symbol, number>();

/** Registers a mounted page's render version; returns the function that removes it. */
export function registerPageVersion(version: number): () => void {
  const token = Symbol("page-version");
  versions.set(token, version);
  return () => {
    versions.delete(token);
  };
}

/**
 * The oldest version among the mounted stamps, or null when no page has one. Normally exactly one page is mounted; if the router
 * keeps a previous page around for a moment, the lowest number is the safe one to compare with (it refreshes more, never less).
 */
export function currentPageVersion(): number | null {
  let lowest: number | null = null;
  for (const v of versions.values()) if (lowest === null || v < lowest) lowest = v;
  return lowest;
}
