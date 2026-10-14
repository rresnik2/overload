// Pure ownership logic (unit-tested). The CLI is scripts/ownership-check.ts.
import picomatch from "picomatch";

export interface StreamConfig {
  name: string;
  owns: string[];
  exclude?: string[];
}
export interface OwnershipConfig {
  shared: string[];
  frozen: string[];
  /** Built by Wave 3 only (stream W3 is unrestricted): everyone else gets a violation. */
  integration?: string[];
  streams: Record<string, StreamConfig>;
  unrestricted: string[];
}
export interface Violation {
  path: string;
  reason: string;
}

const opts = { dot: true };
// Next route groups like "(app)" would be read as glob groups: escape literal parentheses (brackets are escaped in ownership.json).
const escapeParens = (glob: string) => glob.replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const matchAny = (globs: string[], path: string) => globs.length > 0 && picomatch(globs.map(escapeParens), opts)(path);

export function ownsPath(config: OwnershipConfig, stream: string, path: string): boolean {
  const s = config.streams[stream];
  if (!s) return false;
  return matchAny(s.owns, path) && !matchAny(s.exclude ?? [], path);
}

export function ownerOf(config: OwnershipConfig, path: string): string | null {
  return Object.keys(config.streams).find((k) => ownsPath(config, k, path)) ?? null;
}

export function isIntegration(config: OwnershipConfig, path: string): boolean {
  return matchAny(config.integration ?? [], path);
}

export function isFrozen(config: OwnershipConfig, path: string): boolean {
  return matchAny(config.frozen, path);
}

export function checkOwnership(config: OwnershipConfig, stream: string, paths: string[]): Violation[] {
  if (config.unrestricted.includes(stream)) return [];
  if (!config.streams[stream]) throw new Error(`Unknown stream "${stream}". Known: ${Object.keys(config.streams).join(", ")}`);
  const shared = config.shared.map((g) => g.replaceAll("{stream}", stream));
  const violations: Violation[] = [];
  for (const path of paths) {
    if (matchAny(shared, path) || ownsPath(config, stream, path)) continue;
    const owner = ownerOf(config, path);
    if (!owner && matchAny(config.integration ?? [], path)) violations.push({ path, reason: "owned by Wave 3 (integration)" });
    else if (owner) violations.push({ path, reason: `owned by stream ${owner}` });
    else if (isFrozen(config, path)) violations.push({ path, reason: "frozen: write change-requests/<stream>-<n>.md instead" });
    else violations.push({ path, reason: "not owned by any stream (add it to ownership.json via a change request)" });
  }
  return violations;
}
