// pnpm ownership:check --stream=X [--base=main]
// Diffs the current branch (commits + working tree + untracked files) against its merge-base with `base` and fails
// when any changed path is outside stream X's globs in ownership.json.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { checkOwnership, type OwnershipConfig } from "./lib/ownership";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const stream = args.stream;
const base = args.base ?? "main";
if (!stream) {
  console.error("Usage: pnpm ownership:check --stream=<A|B|C|D|E1|E2|F|G|W3> [--base=main]");
  process.exit(2);
}

const git = (...a: string[]) => execFileSync("git", a, { encoding: "utf8" }).trim();
const lines = (s: string) => s.split("\n").filter(Boolean);

const config = JSON.parse(fs.readFileSync("ownership.json", "utf8")) as OwnershipConfig;
const mergeBase = git("merge-base", base, "HEAD");
const changed = new Set([
  ...lines(git("diff", "--name-only", "--no-renames", mergeBase)), // commits + working tree vs merge-base
  ...lines(git("ls-files", "--others", "--exclude-standard")), // untracked
]);

const violations = checkOwnership(config, stream, [...changed].sort());
if (violations.length === 0) {
  console.log(`ownership OK: ${changed.size} changed path(s), all within stream ${stream}.`);
} else {
  console.error(`ownership FAILED for stream ${stream}: ${violations.length} path(s) outside its globs:`);
  for (const v of violations) console.error(`  ${v.path}   (${v.reason})`);
  process.exit(1);
}
