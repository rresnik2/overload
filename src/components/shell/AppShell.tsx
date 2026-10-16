import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { InfoHint } from "@/components/ui/InfoHint";
import { SyncPip } from "@/components/ui/SyncPip";
import { ToastProvider } from "@/components/ui/Toast";
import { Avatar } from "./Avatar";
import { DesktopNav } from "./DesktopNav";
import { Dock } from "./Dock";
import { EdgeSwipeBack } from "./EdgeSwipeBack";
import { InstallHint } from "./InstallHint";
import { PageTransition } from "./PageTransition";
import { PwaClient } from "./PwaClient";
import { SwipeMain } from "./SwipeMain";
import { START_WORKOUT } from "./nav";
import { NavIcon } from "./NavIcon";
import { ThemeToggle } from "./ThemeToggle";

export interface AppShellProps {
  user: { name: string; image?: string | null };
  children: ReactNode;
}

/**
 * The signed-in shell. Landmarks: skip link, <header> (frame navbar on desktop / compact bar on mobile), <nav> (desktop
 * links in the header, dock on mobile), <main id="main">. Flat background: no photo backdrop on logging screens.
 */
export function AppShell({ user, children }: AppShellProps) {
  return (
    <ToastProvider>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="shell-header">
        <div className="shell-frame">
          <Link href="/today" className="shell-brand" aria-label="Overload, home">
            Overload
          </Link>
          <DesktopNav />
          <div className="shell-tools">
            <ButtonLink href={START_WORKOUT.href} className="shell-start" icon={<NavIcon name="workout" size={18} />}>
              Start workout
            </ButtonLink>
            <SyncPip />
            <InfoHint term="syncStatus" />
            <ThemeToggle />
            <Avatar name={user.name} image={user.image} />
          </div>
        </div>
      </header>
      <SwipeMain>
        <InstallHint />
        <PageTransition>{children}</PageTransition>
      </SwipeMain>
      <EdgeSwipeBack />
      <Dock />
      <PwaClient />
    </ToastProvider>
  );
}
