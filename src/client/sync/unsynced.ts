"use client";
// The number of rows with unsent changes, each counted once however often it changed. One definition for every control that shows
// it (the header pip and the workout bar's Sync now), so they cannot disagree.
import { requireActiveDb } from "@/client/db/active";
import { useLive } from "@/client/repo";

/** Rows waiting to upload, or undefined until the local database has answered. */
export function useUnsyncedRows(): number | undefined {
  // A count is a nicety: if the local database cannot answer, the pip falls back to the sync engine's own count (a thrown error
  // here would surface in the header of every page).
  return useLive(async () => {
    try {
      return (await requireActiveDb().outbox.orderBy("[entity+id]").uniqueKeys()).length;
    } catch (error) {
      console.error("[unsynced rows] count failed", error);
      return undefined;
    }
  });
}
