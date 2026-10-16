// Ask the browser not to evict the offline database. Unsent workouts live only in IndexedDB until the next sync, and a browser under
// storage pressure may clear "best effort" storage. Chrome decides silently from engagement (installed apps are granted), Safari
// from home-screen use, Firefox prompts: so it is asked at most twice per browser (after sign-in, and again when the first workout
// starts), never blocks anything, and logs nothing.
const ATTEMPTS_KEY = "overload:persist-attempts";
const MAX_ATTEMPTS = 2;

export async function ensurePersistentStorage(): Promise<void> {
  try {
    const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
    if (!storage || typeof storage.persist !== "function") return;
    if (typeof storage.persisted === "function" && (await storage.persisted())) return;
    const attempts = Number(localStorage.getItem(ATTEMPTS_KEY) ?? 0);
    if (attempts >= MAX_ATTEMPTS) return;
    localStorage.setItem(ATTEMPTS_KEY, String(attempts + 1));
    await storage.persist();
  } catch {
    /* unsupported, blocked or private mode: nothing to do */
  }
}
