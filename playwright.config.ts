// FROZEN after Phase 0. Port comes from PORT (A 3001 · B 3002 · C 3003 · D 3004 · E1 3005; Wave 2: E2 3001 · F 3002 · G 3003).
// E2E_PROD=1 runs against a production build (`pnpm build && pnpm start`), required for offline/service-worker specs.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// The specs sign up throwaway users and, on production builds, write to the database directly (e2e/_support/db.ts).
// The main checkout's .env.local points at the production database, so local runs must happen in a worktree that has
// its own Neon branch (`pnpm db:branch <stream>`). CI provides its own database and is exempt.
if (!process.env.CI) {
  const mainCheckout = /^worktree (.+)$/m.exec(
    execFileSync("git", ["worktree", "list", "--porcelain"], { encoding: "utf8" }),
  )?.[1];
  if (mainCheckout && path.resolve(mainCheckout) === path.resolve(process.cwd())) {
    throw new Error(
      "Refusing to run e2e in the main checkout: its .env.local is the production database. Run it in a worktree after `pnpm db:branch <stream>`.",
    );
  }
}

const port = Number(process.env.PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;
const prod = process.env.E2E_PROD === "1";
// The `perf` project (e2e/perf, see docs/perf/baseline.md) is opt-in: it only exists when PERF=1, and the other projects ignore its specs.
const perf = process.env.PERF === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: "**/perf/**" },
    { name: "webkit-iphone", use: { ...devices["iPhone 15"] }, testIgnore: "**/perf/**" },
    ...(perf
      ? [
          {
            name: "perf",
            testMatch: "perf/**/*.spec.ts",
            // One measurement at a time: parallel workers would distort each other's timings.
            fullyParallel: false,
            workers: 1,
            timeout: 300_000,
            // Pixel 7 on Chromium; each spec adds CDP CPU (4x) and network (about 1.6 Mbps, 150 ms RTT) throttling.
            use: { ...devices["Pixel 7"], trace: "off" as const },
          },
        ]
      : []),
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: prod ? `pnpm build && pnpm start -p ${port}` : `pnpm dev -p ${port}`,
        url: baseURL,
        // Auth origin checks need BETTER_AUTH_URL to match the port this worktree serves on.
        env: { BETTER_AUTH_URL: baseURL, NEXT_PUBLIC_APP_URL: baseURL },
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
