// (app) layout. Phase 0 stub: guards the group and mounts the sync provider.
// Stream B replaces the visual shell (frame navbar / dock) but MUST keep requireUser() and <SyncProvider userId>.
import type { ReactNode } from "react";
import { SyncProvider } from "@/client/sync";
import { requireUser } from "@/server/auth/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireUser();
  return (
    <SyncProvider userId={ctx.id}>
      <main className="mx-auto max-w-5xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</main>
    </SyncProvider>
  );
}
