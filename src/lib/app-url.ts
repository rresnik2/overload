// The app's public origin, shared by the auth server (OAuth callbacks, passkey origin, trusted origins) and the root
// layout (metadataBase). An explicit BETTER_AUTH_URL / NEXT_PUBLIC_APP_URL wins, except that a localhost value is ignored on
// Vercel: copying .env.local into the dashboard would otherwise send Google's OAuth callback to http://localhost:3000.
// On Vercel without a usable value, production uses the project's production domain and previews use their own URL.

type Env = Record<string, string | undefined>;

const LOCAL = "http://localhost:3000";

function isLocalhost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

export function resolveAppUrl(env: Env = process.env): string {
  const onVercel = Boolean(env.VERCEL_ENV);
  const explicit = (env.BETTER_AUTH_URL || env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (explicit && !(onVercel && isLocalhost(explicit))) return explicit;
  if (env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return explicit || LOCAL;
}
