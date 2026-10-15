// Client repository (Dexie-backed), owned by stream E1. Import `repo` and `useLive` from "@/client/repo".
// `repo` talks to the ACTIVE per-user database, which <SyncProvider userId> opens and activates.
import { requireActiveDb } from "@/client/db/active";
import type { Repo } from "@/contracts/repo";
import { createRepo } from "./repo";

export const repo: Repo = createRepo(requireActiveDb);

export { useLive } from "./use-live";
