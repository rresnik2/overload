import { describe, expect, it } from "vitest";
import { mainCheckoutRefusal, type Git } from "./main-checkout-guard";

const MAIN = "/Users/dev/overload";
const WORKTREE = `${MAIN}/.claude/worktrees/agent-1`;
const porcelain = `worktree ${MAIN}\nHEAD abc\nbranch refs/heads/main\n\nworktree ${WORKTREE}\nHEAD def\nbranch refs/heads/x\n`;

/** A fake git: `toplevel` is what `rev-parse --show-toplevel` prints for the directory the suite is started from. */
const fakeGit =
  (toplevel: string): Git =>
  (args) =>
    args[0] === "worktree" ? porcelain : `${toplevel}\n`;

describe("mainCheckoutRefusal", () => {
  it("refuses in the main checkout, and from a subdirectory of it", () => {
    const message = mainCheckoutRefusal("integration tests", { env: {}, cwd: MAIN, git: fakeGit(MAIN) });
    expect(message).toMatch(/Refusing to run integration tests in the main checkout/);
    expect(message).toMatch(/production database/);
    expect(mainCheckoutRefusal("integration tests", { env: {}, cwd: `${MAIN}/src`, git: fakeGit(MAIN) })).toMatch(/Refusing/);
  });

  it("allows a linked worktree even though its path is inside the main checkout's directory", () => {
    expect(mainCheckoutRefusal("integration tests", { env: {}, cwd: WORKTREE, git: fakeGit(WORKTREE) })).toBeNull();
  });

  it("is exempt in CI, which provides its own database", () => {
    expect(mainCheckoutRefusal("integration tests", { env: { CI: "true" }, cwd: MAIN, git: fakeGit(MAIN) })).toBeNull();
  });

  it("asks git from the directory it was given", () => {
    const seen: string[] = [];
    const git: Git = (args, cwd) => {
      seen.push(cwd);
      return args[0] === "worktree" ? porcelain : WORKTREE;
    };
    mainCheckoutRefusal("integration tests", { env: {}, cwd: WORKTREE, git });
    expect(seen).toEqual([WORKTREE, WORKTREE]);
  });
});
