// (workout) layout: the gym screen. Guards the group, mounts the sync provider, toasts and the service-worker client (so a waiting
// update only activates after the workout ends, change request B-2) and gives a bare frame: no dock, no photo backdrop.
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SyncProvider } from "@/client/sync";
import { EdgeSwipeBack } from "@/components/shell/EdgeSwipeBack";
import { PwaClient } from "@/components/shell/PwaClient";
import { SyncPip } from "@/components/ui/SyncPip";
import { ToastProvider } from "@/components/ui/Toast";
import { PrefsProvider } from "@/components/workout/prefs";
import { loadWorkoutPrefs } from "@/components/workout/prefs.server";
import { requireSessionInfo } from "@/server/auth/session";
import { redirectIfNotOnboarded } from "@/server/profile/guard";
import { metadata as appMetadata } from "../(app)/layout";

// Same icons and iOS splash screens as the (app) group.
export const metadata: Metadata = appMetadata;

export default async function WorkoutLayout({ children }: { children: ReactNode }) {
  const { ctx } = await requireSessionInfo();
  await redirectIfNotOnboarded(ctx);
  const prefs = await loadWorkoutPrefs(ctx);
  return (
    <SyncProvider userId={ctx.id}>
      <ToastProvider>
        <PrefsProvider prefs={prefs}>
          <div className="wk-shell">
            <header className="wk-topbar">
              <Link href="/today" className="wk-topbar__back">
                Today
              </Link>
              <span className="wk-topbar__brand">Overload</span>
              <SyncPip />
            </header>
            <main id="main" className="wk-main" tabIndex={-1}>
              {children}
            </main>
          </div>
          <EdgeSwipeBack />
          <PwaClient />
        </PrefsProvider>
      </ToastProvider>
    </SyncProvider>
  );
}
