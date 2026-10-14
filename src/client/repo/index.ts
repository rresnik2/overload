// Client repository. STUB (stream E1 implements; the `Repo` interface in src/contracts/repo.ts is frozen).
// Phase 0: every method throws `not implemented: repo.<path>` so a premature call fails loudly.
import type { Repo, UseLive } from "@/contracts/repo";

function notImplementedProxy(path: string[]): unknown {
  return new Proxy(() => undefined, {
    get(_target, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined; // keep `await repo.x` and inspection sane
      return notImplementedProxy([...path, prop]);
    },
    apply() {
      throw new Error(`not implemented: repo.${path.join(".")}`);
    },
  });
}

export const repo: Repo = notImplementedProxy([]) as Repo;

/** Re-runs `query` whenever the Dexie tables it reads change (wraps dexie-react-hooks' useLiveQuery). */
export const useLive: UseLive = () => {
  throw new Error("not implemented: useLive");
};
