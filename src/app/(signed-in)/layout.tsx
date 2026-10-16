// (signed-in) layout: parent of the (app) shell and the (workout) screen. It owns the sync provider, so the sync engine, its timers
// and its listeners keep running when the lifter moves between the two groups (Today -> Start workout -> Today) instead of
// stopping and starting again with a sync request each time. The children keep their own guards (onboarding) and chrome.
import type { ReactNode } from "react";
import { SyncProvider } from "@/client/sync";
import { requireSessionInfo } from "@/server/auth/session";

export default async function SignedInLayout({ children }: { children: ReactNode }) {
  const { ctx } = await requireSessionInfo();
  return <SyncProvider userId={ctx.id}>{children}</SyncProvider>;
}
