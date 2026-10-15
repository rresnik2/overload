// Sanitise a `?next=` redirect target: same-origin absolute paths only (no protocol-relative or backslash tricks).
export function safeNext(value: string | null | undefined, fallback = "/today"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || value.includes("\\")) return fallback;
  return value;
}
