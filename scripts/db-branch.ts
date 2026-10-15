// pnpm db:branch <stream>
// Creates (or reuses) a Neon branch for this worktree via neonctl and writes DATABASE_URL / DIRECT_URL / PORT /
// BETTER_AUTH_URL into .env.local. Secrets are never printed. Requires NEON_API_KEY and NEON_PROJECT_ID.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { branchName, missingVars, missingVarsMessage, parseEnv, streamPort, upsertEnv } from "./lib/db-branch";

const stream = process.argv[2]?.toUpperCase();
if (!stream || stream.startsWith("-")) {
  console.error("Usage: pnpm db:branch <stream>   (A, B, C, D, E1, E2, F, G, W3)");
  process.exit(2);
}

function readEnvFile(file: string): Record<string, string> {
  try {
    return parseEnv(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

/** The primary worktree's directory (where the owner keeps the real .env.local). */
function mainWorktree(): string | null {
  try {
    const out = execFileSync("git", ["worktree", "list", "--porcelain"], { encoding: "utf8" });
    return /^worktree (.+)$/m.exec(out)?.[1] ?? null;
  } catch {
    return null;
  }
}

const localFile = path.resolve(".env.local");
const main = mainWorktree();
const fromFiles = process.env.OVERLOAD_NO_ENV_FILES ? {} : { ...(main ? readEnvFile(path.join(main, ".env.local")) : {}), ...readEnvFile(localFile) };
const env: Record<string, string | undefined> = { ...fromFiles, ...process.env };

const missing = missingVars(env);
if (missing.length > 0) {
  console.error(missingVarsMessage(missing));
  process.exit(1);
}

const port = streamPort(stream);
const apiKey = env.NEON_API_KEY as string;
const projectId = env.NEON_PROJECT_ID as string;
let suffix = "";
try {
  suffix = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim().replace(/^.*\//, "");
} catch {
  /* not a git checkout */
}
const name = branchName(stream, suffix);

function neon(args: string[]): string {
  // The API key is passed through the environment, never on the command line (visible in `ps`).
  return execFileSync("pnpm", ["exec", "neonctl", ...args, "--project-id", projectId, "--output", "json"], {
    encoding: "utf8",
    env: { ...process.env, NEON_API_KEY: apiKey },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function connectionString(pooled: boolean): string {
  const args = ["connection-string", name];
  if (pooled) args.push("--pooled");
  if (env.NEON_DATABASE_NAME) args.push("--database-name", env.NEON_DATABASE_NAME);
  if (env.NEON_ROLE_NAME) args.push("--role-name", env.NEON_ROLE_NAME);
  return execFileSync("pnpm", ["exec", "neonctl", ...args, "--project-id", projectId], {
    encoding: "utf8",
    env: { ...process.env, NEON_API_KEY: apiKey },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

try {
  const existing = JSON.parse(neon(["branches", "list"])) as { name: string }[];
  if (existing.some((b) => b.name === name)) {
    console.log(`Neon branch "${name}" already exists: reusing it.`);
  } else {
    const args = ["branches", "create", "--name", name];
    if (env.NEON_PARENT_BRANCH) args.push("--parent", env.NEON_PARENT_BRANCH);
    neon(args);
    console.log(`Created Neon branch "${name}".`);
  }

  const direct = connectionString(false);
  const pooled = connectionString(true);
  const url = `http://localhost:${port}`;
  // A new worktree starts from the owner's main .env.local so it inherits the other secrets (auth, Google,
  // Resend, Anthropic); only the database, port and origin values below are overridden for this worktree.
  const mainFile = main ? path.join(main, ".env.local") : null;
  const base = fs.existsSync(localFile)
    ? fs.readFileSync(localFile, "utf8")
    : mainFile && fs.existsSync(mainFile)
      ? fs.readFileSync(mainFile, "utf8")
      : "";
  const next = upsertEnv(base, {
    DATABASE_URL: pooled,
    DIRECT_URL: direct,
    PORT: String(port),
    BETTER_AUTH_URL: url,
    NEXT_PUBLIC_APP_URL: url,
  });
  fs.writeFileSync(localFile, next, { mode: 0o600 });
  console.log(`Wrote DATABASE_URL, DIRECT_URL, PORT=${port}, BETTER_AUTH_URL to .env.local (values not shown).`);
  console.log("Next: pnpm db:deploy && pnpm db:seed, then pnpm dev -p " + port);
} catch (error) {
  const stderr = (error as { stderr?: Buffer | string }).stderr?.toString().trim();
  console.error(`db:branch failed: ${stderr || (error instanceof Error ? error.message : String(error))}`.replaceAll(apiKey, "***"));
  process.exit(1);
}
