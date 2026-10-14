// FROZEN after Phase 0. Port comes from PORT (A 3001 · B 3002 · C 3003 · D 3004 · E1 3005; Wave 2: E2 3001 · F 3002 · G 3003).
// E2E_PROD=1 runs against a production build (`pnpm build && pnpm start`), required for offline/service-worker specs.
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;
const prod = process.env.E2E_PROD === "1";

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
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-iphone", use: { ...devices["iPhone 15"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: prod ? `pnpm build && pnpm start -p ${port}` : `pnpm dev -p ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
