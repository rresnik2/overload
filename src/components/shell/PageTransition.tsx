"use client";
import { usePathname } from "next/navigation";
import { addTransitionType, startTransition, useEffect, useState, ViewTransition } from "react";
import type { ReactNode } from "react";

/** The slice of the Navigation API used to tell history back from forward (Chromium and recent Safari; absent elsewhere). */
interface NavigationLike extends EventTarget {
  currentEntry: { index: number } | null;
}
interface NavigateEventLike extends Event {
  navigationType?: string;
  destination?: { index: number };
}

/**
 * Browser and history navigations (the back button, the edge swipe, router.back()) arrive as `popstate`, outside any Link or
 * router.push, so they carry no transition type. This tags them: inside a transition of its own it adds `nav-back` (or
 * `nav-forward` when the Navigation API says the traversal went forward) and schedules a no-op update. React queues the types on the
 * root, and they join Next's own popstate transition, which commits in the same render, so the ViewTransition below sees them.
 */
function useTagHistoryTraversals() {
  const [, bump] = useState(0);
  useEffect(() => {
    const nav = (window as Window & { navigation?: NavigationLike }).navigation;
    let direction: "nav-back" | "nav-forward" = "nav-back";
    const onNavigate = (e: Event) => {
      const ev = e as NavigateEventLike;
      if (ev.navigationType !== "traverse" || !ev.destination || !nav?.currentEntry) return;
      direction = ev.destination.index < nav.currentEntry.index ? "nav-back" : "nav-forward";
    };
    const onPopState = () => {
      const type = direction;
      direction = "nav-back";
      startTransition(() => {
        addTransitionType(type);
        bump((n) => n + 1);
      });
    };
    nav?.addEventListener("navigate", onNavigate);
    window.addEventListener("popstate", onPopState);
    return () => {
      nav?.removeEventListener("navigate", onNavigate);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);
}

/** Leaves the types of the last page slide on <html> (`data-nav-types`) so tests and DevTools can see which direction ran. */
function recordTypes(_instance: unknown, types: string[]) {
  document.documentElement.dataset.navTypes = types.join(" ");
}

/**
 * Page slides (the portfolio's view transitions): keyed on the pathname so each route's content enters and exits.
 * Navigation links and swipes carry `transitionTypes` ("nav-forward" / "nav-back"); history traversals are tagged above.
 * motion.css maps the types to the slides and disables everything under prefers-reduced-motion. Layouts persist across
 * navigations, hence the key.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  useTagHistoryTraversals();
  return (
    <ViewTransition
      key={pathname}
      enter={{ "nav-forward": "page-in", "nav-back": "page-in-back", default: "none" }}
      exit={{ "nav-forward": "page-out", "nav-back": "page-out-back", default: "none" }}
      default="none"
      onEnter={recordTypes}
      onExit={recordTypes}
    >
      {children}
    </ViewTransition>
  );
}
