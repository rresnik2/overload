// Pure helpers for scripts/db-branch.ts (unit-tested; no network, no secrets).
export const STREAM_PORTS: Record<string, number> = { A: 3001, B: 3002, C: 3003, D: 3004, E1: 3005, E2: 3001, F: 3002, G: 3003, W3: 3000, FAV: 3004 };

export const REQUIRED_VARS = ["NEON_API_KEY", "NEON_PROJECT_ID"] as const;

export function missingVars(env: Record<string, string | undefined>): string[] {
  return REQUIRED_VARS.filter((name) => !env[name]);
}

export function missingVarsMessage(missing: string[]): string {
  return [
    `db:branch needs ${missing.join(" and ")} (not set).`,
    "",
    "  NEON_API_KEY     Neon console > Account settings > API keys > Create new API key",
    "  NEON_PROJECT_ID  Neon console > your project > Settings > General > Project ID",
    "",
    "Put them in .env.local (this worktree's, or the main checkout's) or export them in your shell. See .env.example.",
    "Agents never create or invent these values: ask the owner (Reece) to add them.",
  ].join("\n");
}

export function streamPort(stream: string): number {
  const port = STREAM_PORTS[stream];
  if (!port) throw new Error(`Unknown stream "${stream}". Known: ${Object.keys(STREAM_PORTS).join(", ")}`);
  return port;
}

/** Neon branch names: letters, digits, dashes. e.g. wt-e1-3f2a9c1 */
export function branchName(stream: string, suffix: string): string {
  const clean = suffix.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  return `wt-${stream.toLowerCase()}${clean ? `-${clean}` : ""}`;
}

/** Parse KEY=VALUE lines (no interpolation); later entries win. Quotes are stripped. */
export function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    let value = m[2] ?? "";
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[m[1] as string] = value;
  }
  return out;
}

/** Set variables in an env file's text, replacing existing assignments in place and appending new ones. Keeps comments. */
export function upsertEnv(content: string, vars: Record<string, string>): string {
  const lines = content === "" ? [] : content.replace(/\n$/, "").split("\n");
  const remaining = new Map(Object.entries(vars));
  const next = lines.map((line) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    const key = m?.[1];
    if (key && remaining.has(key)) {
      const value = remaining.get(key) as string;
      remaining.delete(key);
      return `${key}=${value}`;
    }
    return line;
  });
  for (const [k, v] of remaining) next.push(`${k}=${v}`);
  return `${next.join("\n")}\n`;
}
