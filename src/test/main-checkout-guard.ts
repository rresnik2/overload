// Refuses to run database-touching suites in the main checkout, whose .env.local is the production database.
// `playwright.config.ts` has the same rule inline; the Vitest integration project calls this from its globalSetup.
// Pure apart from the default `git` runner so it can be unit-tested with fake git output.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type Git = (args: string[], cwd: string) => string;

const runGit: Git = (args, cwd) => execFileSync("git", args, { encoding: "utf8", cwd });

const canonical = (p: string): string => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

/**
 * The refusal message when `cwd` is inside the main checkout (the first entry of `git worktree list`), else null.
 * Linked worktrees live under the main checkout's `.claude/worktrees/`, so a path-prefix test is wrong: compare the
 * repository top level of `cwd` with the main worktree instead. CI provides its own database and is exempt.
 */
export function mainCheckoutRefusal(what: string, opts: { env?: Record<string, string | undefined>; cwd?: string; git?: Git } = {}): string | null {
  if ((opts.env ?? process.env).CI) return null;
  const git = opts.git ?? runGit;
  const cwd = opts.cwd ?? process.cwd();
  const main = /^worktree (.+)$/m.exec(git(["worktree", "list", "--porcelain"], cwd))?.[1];
  const top = git(["rev-parse", "--show-toplevel"], cwd).trim();
  if (!main || canonical(main) !== canonical(top)) return null;
  return `Refusing to run ${what} in the main checkout: its .env.local is the production database. Run it in a worktree after \`pnpm db:branch <stream>\`.`;
}
