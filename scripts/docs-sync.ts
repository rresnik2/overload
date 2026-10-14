// pnpm docs:sync          regenerate the signature blocks in CONTRACTS.md and docs/agents/*.md from the source
// pnpm docs:sync --check  fail (exit 1) if any block is out of date (also enforced by scripts/docs.test.ts)
import fs from "node:fs";
import path from "node:path";
import { syncDoc } from "./lib/excerpt";

export function docFiles(): string[] {
  const agents = fs.existsSync("docs/agents") ? fs.readdirSync("docs/agents").filter((f) => f.endsWith(".md")).map((f) => path.join("docs/agents", f)) : [];
  return ["CONTRACTS.md", ...agents].filter((f) => fs.existsSync(f));
}

export function outOfDate(): string[] {
  const read = (p: string) => fs.readFileSync(p, "utf8");
  return docFiles().filter((f) => syncDoc(read(f), read) !== read(f));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes("--check");
  const read = (p: string) => fs.readFileSync(p, "utf8");
  let stale = 0;
  for (const f of docFiles()) {
    const next = syncDoc(read(f), read);
    if (next !== read(f)) {
      stale += 1;
      if (!check) fs.writeFileSync(f, next);
      console.log(`${check ? "out of date" : "updated"}: ${f}`);
    }
  }
  if (check && stale > 0) {
    console.error("Run `pnpm docs:sync` and commit the result.");
    process.exit(1);
  }
}
