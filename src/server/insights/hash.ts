import { createHash } from "node:crypto";

/** JSON with object keys sorted at every level, so equal data always serializes to equal text. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** sha256 (hex) of the stable JSON of a facts bundle: the dedupe key of a weekly report. */
export function factsHash(facts: unknown): string {
  return createHash("sha256").update(stableStringify(facts)).digest("hex");
}
