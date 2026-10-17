// FROZEN after Phase 0. Three projects:
//   unit        node, *.test.ts(x)            -> `pnpm test`
//   dom         jsdom, *.dom.test.tsx          -> `pnpm test`
//   integration node, *.integration.test.ts    -> `pnpm test:integration` (needs a Neon branch in .env.local; refuses to run in the main checkout)
import path from "node:path";
import react from "@vitejs/plugin-react";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv({ path: [".env.local", ".env"], quiet: true });

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  // `server-only` throws outside the react-server condition; in tests it is a no-op.
  "server-only": path.resolve(import.meta.dirname, "src/test/server-only-stub.ts"),
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    globals: false,
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/generated/**", "src/**/*.test.*", "src/test/**"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "prisma/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["**/*.integration.test.ts", "**/*.dom.test.*", "**/node_modules/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.dom.test.{ts,tsx}"],
          setupFiles: ["src/test/dom-setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          // Refuses to start in the main checkout, whose .env.local is production. The unit and dom projects do not load it.
          globalSetup: ["src/test/refuse-main-checkout.ts"],
          include: ["src/**/*.integration.test.ts", "prisma/**/*.integration.test.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
