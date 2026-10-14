// Typed, lazily-parsed environment. Every variable is documented in .env.example.
// Server-only: never import from client code (these are secrets).
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).default("Overload <onboarding@resend.dev>"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  INSIGHTS_MODEL: z.string().min(1).default("claude-opus-5-5"),
  CRON_SECRET: z.string().min(16).optional(),
  PASSKEY_RP_ID: z.string().min(1).optional(),
  PASSKEY_RP_NAME: z.string().min(1).default("Overload"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parse once, throw a readable error listing every missing/invalid variable. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
