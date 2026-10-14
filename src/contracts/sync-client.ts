// Props of client sync components. FROZEN after Phase 0 (React-free so contracts stay pure).
export interface SyncProviderProps {
  /** The signed-in user's id (from the server session). Each user gets their own Dexie database. */
  userId: string;
}
