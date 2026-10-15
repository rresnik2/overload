// Result shape returned by the profile Server Actions (they never throw validation errors at the client).
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function failure(error: string, fieldErrors?: Record<string, string>): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error };
}

/** Flatten a Zod error to `{ field: first message }` (dotted paths). */
export function fieldErrorsOf(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}
