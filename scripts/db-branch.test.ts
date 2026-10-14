import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { branchName, missingVars, parseEnv, streamPort, upsertEnv } from "./lib/db-branch";

describe("db-branch helpers", () => {
  it("maps streams to their dev-server ports", () => {
    expect(["A", "B", "C", "D", "E1"].map(streamPort)).toEqual([3001, 3002, 3003, 3004, 3005]);
    expect(["E2", "F", "G"].map(streamPort)).toEqual([3001, 3002, 3003]);
    expect(() => streamPort("Z")).toThrow(/Unknown stream/);
  });

  it("builds safe branch names", () => {
    expect(branchName("E1", "worktree/Sync Engine!")).toBe("wt-e1-worktree-sync-engine");
    expect(branchName("A", "")).toBe("wt-a");
  });

  it("detects missing variables", () => {
    expect(missingVars({})).toEqual(["NEON_API_KEY", "NEON_PROJECT_ID"]);
    expect(missingVars({ NEON_API_KEY: "k", NEON_PROJECT_ID: "" })).toEqual(["NEON_PROJECT_ID"]);
    expect(missingVars({ NEON_API_KEY: "k", NEON_PROJECT_ID: "p" })).toEqual([]);
  });

  it("parses and upserts env text without losing comments or other keys", () => {
    const text = "# keep me\nNEON_API_KEY=abc\nPORT=3000\nQUOTED=\"x y\"\n";
    expect(parseEnv(text)).toEqual({ NEON_API_KEY: "abc", PORT: "3000", QUOTED: "x y" });
    expect(upsertEnv(text, { PORT: "3003", DATABASE_URL: "postgres://x" })).toBe(
      "# keep me\nNEON_API_KEY=abc\nPORT=3003\nQUOTED=\"x y\"\nDATABASE_URL=postgres://x\n",
    );
    expect(upsertEnv("", { A: "1" })).toBe("A=1\n");
  });
});

describe("pnpm db:branch", () => {
  it("exits 1 with a clear message when NEON_API_KEY / NEON_PROJECT_ID are missing", () => {
    const env: NodeJS.ProcessEnv = { ...process.env, OVERLOAD_NO_ENV_FILES: "1" };
    delete env.NEON_API_KEY;
    delete env.NEON_PROJECT_ID;
    const result = spawnSync("pnpm", ["exec", "tsx", "scripts/db-branch.ts", "C"], { encoding: "utf8", env });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("NEON_API_KEY and NEON_PROJECT_ID");
    expect(result.stderr).toContain("Project ID");
  }, 30_000);

  it("prints usage and exits 2 without a stream", () => {
    const result = spawnSync("pnpm", ["exec", "tsx", "scripts/db-branch.ts"], { encoding: "utf8" });
    expect(result.status).toBe(2);
  }, 30_000);
});
