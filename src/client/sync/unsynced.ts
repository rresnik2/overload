"use client";
// The number of rows with unsent changes, each counted once however often it changed. One definition for every control that shows
// it (the header pip and the workout bar's Sync now), so they cannot disagree.
import { requireActiveDb } from "@/client/db/active";
import { useLive } from "@/client/repo";

/** Rows waiting to upload, or undefined until the local database has answered. */
export function useUnsyncedRows(): number | undefined {
  return useLive(async () => (await requireActiveDb().outbox.orderBy("[entity+id]").uniqueKeys()).length);
}
