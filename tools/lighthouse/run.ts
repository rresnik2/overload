// Lighthouse budgets (stream W3). Run against a PRODUCTION server (`pnpm build && pnpm start -p 3000`), as the demo user:
//   pnpm exec tsx tools/lighthouse/run.ts [baseUrl]            (default http://localhost:${PORT:-3000})
// The demo user must be seeded (`pnpm exec tsx prisma/seed/fixtures.ts`). Exits 1 when any budget is missed.
// Lighthouse 13 has no PWA category any more, so "installable" is checked here directly: manifest fields and icons (what Chrome's
// install criteria read) plus the service worker script, alongside e2e/shell.spec.ts which proves the worker takes control.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const base = (process.argv[2] ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, "");
const DEMO_EMAIL = "demo@overload.test";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "overload-demo-only-2026";
const SQUAT = "83a024cb-efa6-5b1b-8cef-e115a267bd5b";

/**
 * Minimum category scores (0-1), mobile emulation with Lighthouse's default simulated throttling (slow 4G, 4x CPU) against a server on
 * this machine. Accessibility and best practices are the same everywhere; performance is per page because the signed-in pages hit
 * the database (TTFB) and the progress page ships a charting library (total blocking time, forced reflow while it measures).
 */
const BUDGETS = { performance: 0.85, accessibility: 0.95, "best-practices": 0.95 } as const;
const PAGES = [
  { name: "landing", path: "/", auth: false, performance: 0.85 },
  { name: "sign-in", path: "/sign-in", auth: false, performance: 0.85 },
  { name: "today", path: "/today", auth: true, performance: 0.8 },
  { name: "progress series", path: `/progress/${SQUAT}`, auth: true, performance: 0.7 },
  // Added by PERF-0. Baseline: workout 75 (LCP ~10.8 s), exercises 85. Workout is held at 70 like the progress page until the perf waves raise it (target 80).
  { name: "workout", path: "/workout", auth: true, performance: 0.7 },
  { name: "exercises", path: "/exercises", auth: true, performance: 0.8 },
] as const;

async function demoCookie(): Promise<string> {
  const res = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(base).origin },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
  });
  if (!res.ok) throw new Error(`demo sign-in failed (${res.status}): is the demo user seeded?`);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

async function installable(): Promise<string[]> {
  const problems: string[] = [];
  const html = await (await fetch(`${base}/sign-in`)).text();
  if (!/<link[^>]+rel="manifest"/.test(html)) problems.push("no <link rel=manifest>");
  const manifest = (await (await fetch(`${base}/manifest.webmanifest`)).json()) as {
    name?: string; start_url?: string; display?: string; icons?: { src: string; sizes: string; purpose?: string }[];
  };
  if (!manifest.name) problems.push("manifest has no name");
  if (!manifest.start_url) problems.push("manifest has no start_url");
  if (!["standalone", "fullscreen", "minimal-ui"].includes(manifest.display ?? "")) problems.push(`manifest display is ${manifest.display}`);
  for (const size of ["192x192", "512x512"]) {
    const icon = manifest.icons?.find((i) => i.sizes === size && (i.purpose ?? "any").includes("any"));
    if (!icon) problems.push(`no ${size} icon`);
    else if (!(await fetch(new URL(icon.src, base))).ok) problems.push(`${icon.src} does not load`);
  }
  if (!manifest.icons?.some((i) => i.purpose === "maskable")) problems.push("no maskable icon");
  const sw = await fetch(`${base}/serwist/sw.js`);
  if (!sw.ok || !(sw.headers.get("content-type") ?? "").includes("javascript")) problems.push("service worker script does not load");
  return problems;
}

const dir = mkdtempSync(path.join(tmpdir(), "overload-lh-"));
const cookie = await demoCookie();
writeFileSync(path.join(dir, "headers.json"), JSON.stringify({ Cookie: cookie }));
const failures: string[] = [];
const rows: string[] = [];

for (const page of PAGES) {
  const out = path.join(dir, `${page.name.replace(/\W+/g, "-")}.json`);
  const args = [
    "exec", "lighthouse", `${base}${page.path}`,
    "--output=json", `--output-path=${out}`, "--quiet",
    "--only-categories=performance,accessibility,best-practices",
    "--chrome-flags=--headless=new --no-sandbox",
    ...(page.auth ? [`--extra-headers=${path.join(dir, "headers.json")}`] : []),
  ];
  const run = spawnSync("pnpm", args, { env: { ...process.env, CHROME_PATH: chromium.executablePath() }, encoding: "utf8" });
  if (run.status !== 0) {
    failures.push(`${page.name}: lighthouse exited ${run.status}: ${run.stderr.slice(0, 300)}`);
    continue;
  }
  const report = JSON.parse(readFileSync(out, "utf8")) as {
    finalDisplayedUrl: string;
    categories: Record<string, { score: number | null }>;
    audits: Record<string, { numericValue?: number; displayValue?: string; score: number | null; title: string; details?: { items?: Record<string, unknown>[] } }>;
  };
  if (!report.finalDisplayedUrl.endsWith(page.path)) failures.push(`${page.name}: redirected to ${report.finalDisplayedUrl} (signed out?)`);
  const scores = Object.fromEntries(Object.entries({ ...BUDGETS, performance: page.performance }).map(([cat, min]) => [cat, { score: report.categories[cat]?.score ?? 0, min }]));
  for (const [cat, { score, min }] of Object.entries(scores)) {
    if (score < min) {
      const failed = Object.values(report.audits).filter((a) => a.score !== null && a.score < 0.9).map((a) => a.title).slice(0, 8);
      failures.push(`${page.name}: ${cat} ${Math.round(score * 100)} < ${Math.round(min * 100)} (${failed.join("; ")})`);
      const lcp = report.audits["largest-contentful-paint-element"]?.details?.items?.[0] as { items?: { node?: { snippet?: string } }[] } | undefined;
      const shifts = (report.audits["layout-shifts"]?.details?.items ?? []).slice(0, 3).map((i) => `${(i.node as { snippet?: string } | undefined)?.snippet ?? "?"} (${Number(i.score).toFixed(3)})`);
      failures.push(`  ${page.name} detail: LCP element ${lcp?.items?.[0]?.node?.snippet ?? "?"}; layout shifts ${shifts.join(", ") || "none"}`);
    }
  }
  const metric = (id: string) => Math.round(report.audits[id]?.numericValue ?? 0);
  rows.push(
    `${page.name.padEnd(16)} perf ${String(Math.round(scores.performance!.score * 100)).padStart(3)}  a11y ${String(Math.round(scores.accessibility!.score * 100)).padStart(3)}  best ${String(Math.round(scores["best-practices"]!.score * 100)).padStart(3)}  FCP ${metric("first-contentful-paint")}ms  LCP ${metric("largest-contentful-paint")}ms  TBT ${metric("total-blocking-time")}ms  CLS ${(report.audits["cumulative-layout-shift"]?.numericValue ?? 0).toFixed(3)}`,
  );
}

const installProblems = await installable();
rows.push(`installable      ${installProblems.length === 0 ? "ok (manifest, icons 192/512/maskable, service worker)" : installProblems.join("; ")}`);
if (installProblems.length) failures.push(`installable: ${installProblems.join("; ")}`);

console.log(`Lighthouse ${base} (mobile, simulated throttling)\nbudgets: accessibility >= ${BUDGETS.accessibility * 100}, best-practices >= ${BUDGETS["best-practices"] * 100}, performance >= ${PAGES.map((p) => `${p.performance * 100} (${p.name})`).join(", ")}\n${rows.join("\n")}`);
if (failures.length) {
  console.error(`\nBUDGETS MISSED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
