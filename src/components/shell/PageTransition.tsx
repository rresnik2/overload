"use client";
import { usePathname } from "next/navigation";
import { ViewTransition } from "react";
import type { ReactNode } from "react";

/**
 * Page slides (the portfolio's view transitions): keyed on the pathname so each route's content enters and exits.
 * Navigation links carry `transitionTypes={["nav-forward"]}`; motion.css maps the types to the slides and disables
 * everything under prefers-reduced-motion. Layouts persist across navigations, hence the key.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition
      key={pathname}
      enter={{ "nav-forward": "page-in", "nav-back": "page-in-back", default: "none" }}
      exit={{ "nav-forward": "page-out", "nav-back": "page-out-back", default: "none" }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
