// FROZEN after Phase 0. ESLint 10 flat config + eslint-config-next.
// The import rules below are architecture, not style: see CLAUDE.md ("Import rules").
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const PRISMA_AND_DECIMAL = [
  {
    group: ["@prisma/*", "@/generated/*", "**/generated/prisma", "**/generated/prisma/*", "prisma/config"],
    message: "The Prisma client (and Prisma types/enums) may only be imported under src/server/** and prisma/**. Use src/contracts enums and Row types elsewhere.",
  },
  {
    group: ["decimal.js", "decimal.js-light", "big.js"],
    message: "Decimal values never leave src/server. Mappers convert them to numbers (src/server/mappers).",
  },
  {
    group: ["pg", "pg/*"],
    message: "Database drivers belong in src/server/db.ts only.",
  },
];

const LIB_PURITY = [
  {
    group: ["react", "react-dom", "react/*", "react-dom/*", "next", "next/*", "server-only", "client-only"],
    message: "src/lib/** is pure TypeScript: no react, next or server code.",
  },
  {
    group: ["@/server/*", "@/client/*", "@/components/*", "@/app/*", "**/server/*", "**/client/*"],
    message: "src/lib/** must not import server, client, component or app code (it is shared by both sides).",
  },
  {
    group: ["dexie", "dexie-react-hooks", "better-auth", "better-auth/*", "@better-auth/*", "@anthropic-ai/sdk", "resend", "node:*", "fs", "path"],
    message: "src/lib/** is pure and runs in the browser and on the server: no IO libraries or Node built-ins.",
  },
];

const NO_SERVER_IN_CLIENT = [
  {
    group: ["@/server/*", "**/server/*"],
    message: "Client code must never import src/server/**. Talk to the server through route handlers (/api/*) or Server Actions.",
  },
];

const NO_CLIENT_IN_SERVER = [
  {
    group: ["@/client/*", "@/components/*", "**/client/*"],
    message: "src/server/** must not import client code or components.",
  },
];

// Input schemas must never accept identity or server-owned fields from the client.
const NO_USERID_IN_SCHEMA = {
  selector:
    "CallExpression[callee.property.name=/^(object|strictObject|looseObject|extend|safeExtend)$/] > ObjectExpression > Property[key.name='userId']",
  message: "No Zod schema may declare a `userId` field: the user always comes from requireUser()/withUser() (CLAUDE.md).",
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".claude/**", // the app's per-session git worktrees live here; each one is linted in its own checkout
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "src/generated/**",
    "prisma/data/**",
    "public/**",
    "change-requests/**",
  ]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports", fixStyle: "inline-type-imports" }],
      "no-restricted-syntax": ["error", NO_USERID_IN_SCHEMA],
    },
  },
  // Default for everything under src/** (and e2e): no Prisma, no Decimal, no drivers.
  {
    files: ["src/**/*.{ts,tsx}", "e2e/**/*.ts"],
    ignores: ["src/server/**", "src/lib/**", "src/client/**"],
    rules: { "no-restricted-imports": ["error", { patterns: PRISMA_AND_DECIMAL }] },
  },
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [...PRISMA_AND_DECIMAL, ...LIB_PURITY] }] },
  },
  {
    files: ["src/client/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: [...PRISMA_AND_DECIMAL, ...NO_SERVER_IN_CLIENT] }] },
  },
  {
    files: ["src/server/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { patterns: NO_CLIENT_IN_SERVER }] },
  },
  // Service worker runs in a worker scope, not the app.
  {
    files: ["src/app/sw.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  // Plain node scripts / config files.
  {
    files: ["scripts/**/*.ts", "*.config.{ts,mjs}"],
    rules: { "no-restricted-syntax": "off" },
  },
]);
