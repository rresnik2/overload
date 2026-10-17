"use client";
// Rendered by the server pages that show synced data (/today, /progress/*, /exercises, /insights/*). `version` is the user's
// SyncState.version read BEFORE the page's own queries (`pageSyncVersion`, src/server/sync/page-version.ts), so the page contains
// every row up to it. The sync engine's refresh hook compares it with the version a sync caught up to and skips the server
// re-render when the page already has it. Renders nothing.
import { useEffect } from "react";
import { registerPageVersion } from "./page-version";

export function SyncVersionStamp({ version }: { version: number | null }) {
  useEffect(() => (version === null ? undefined : registerPageVersion(version)), [version]);
  return null;
}
