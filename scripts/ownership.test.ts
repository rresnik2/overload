import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { checkOwnership, isFrozen, isIntegration, ownerOf, type OwnershipConfig } from "./lib/ownership";

const config = JSON.parse(fs.readFileSync("ownership.json", "utf8")) as OwnershipConfig;

describe("ownership.json", () => {
  it("lets a stream change its own files and its change requests", () => {
    expect(checkOwnership(config, "C", ["src/app/(app)/exercises/page.tsx", "src/components/exercises/ExerciseCard.tsx", "change-requests/C-1.md", "src/components/exercises/ExerciseCard.test.tsx"])).toEqual([]);
    expect(checkOwnership(config, "D", ["src/lib/analytics/forecast.ts", "src/lib/analytics/forecast.test.ts"])).toEqual([]);
  });

  it("flags other streams' files, frozen files and unowned files with a reason", () => {
    const v = checkOwnership(config, "C", ["src/lib/sync/hlc.ts", "package.json", "src/brand-new-dir/x.ts", "change-requests/D-1.md"]);
    expect(v.map((x) => x.path)).toEqual(["src/lib/sync/hlc.ts", "package.json", "src/brand-new-dir/x.ts", "change-requests/D-1.md"]);
    expect(v[0]?.reason).toMatch(/owned by stream E1/);
    expect(v[1]?.reason).toMatch(/frozen/);
    expect(v[2]?.reason).toMatch(/not owned/);
  });

  it("splits /exercises between C (library) and E2 (new, edit)", () => {
    expect(ownerOf(config, "src/app/(app)/exercises/page.tsx")).toBe("C");
    expect(ownerOf(config, "src/app/(app)/exercises/[id]/page.tsx")).toBe("C");
    expect(ownerOf(config, "src/app/(app)/exercises/new/page.tsx")).toBe("E2");
    expect(ownerOf(config, "src/app/(app)/exercises/[id]/edit/page.tsx")).toBe("E2");
  });

  it("freezes the contracts, schema, lockfile and root layout", () => {
    for (const p of ["src/contracts/sync.ts", "prisma/schema.prisma", "pnpm-lock.yaml", "src/app/layout.tsx", "src/server/auth/session.ts"]) {
      expect(isFrozen(config, p), p).toBe(true);
      expect(ownerOf(config, p), p).toBeNull();
    }
  });

  it("lifts checks for W3", () => {
    expect(checkOwnership(config, "W3", ["package.json", "src/lib/sync/hlc.ts"])).toEqual([]);
  });

  it("rejects unknown streams", () => {
    expect(() => checkOwnership(config, "Z", ["x"])).toThrow(/Unknown stream/);
  });

  it("no path is owned by two streams, and every tracked file is owned, frozen or shared", () => {
    const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
    const streams = Object.keys(config.streams);
    for (const p of tracked) {
      const owners = streams.filter((s) => checkOwnership(config, s, [p]).length === 0);
      expect(owners.length, `${p} owned by ${owners.join(",")}`).toBeLessThanOrEqual(1);
      const classified = owners.length === 1 || isFrozen(config, p) || isIntegration(config, p);
      expect(classified, `${p} is not classified in ownership.json`).toBe(true);
    }
  });
});
