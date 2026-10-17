// Navigation model shared by the desktop navbar, the mobile dock and the "More" sheet. PURE data.
export interface NavItem {
  href: string;
  label: string;
  /** lucide icon name, resolved in NavIcon (keeps this file free of React). */
  icon: "today" | "exercises" | "templates" | "history" | "progress" | "insights" | "settings" | "workout";
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/today", label: "Today", icon: "today" },
  { href: "/exercises", label: "Exercises", icon: "exercises" },
  { href: "/templates", label: "Templates", icon: "templates" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/progress", label: "Progress", icon: "progress" },
  { href: "/insights", label: "Insights", icon: "insights" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export const START_WORKOUT: NavItem = { href: "/workout", label: "Start workout", icon: "workout" };

/** Dock slots on mobile: four destinations around the Start action; the rest live behind "More". */
const navItem = (href: string): NavItem => {
  const item = NAV_ITEMS.find((i) => i.href === href);
  if (!item) throw new Error(`Unknown nav item ${href}`);
  return item;
};
export const DOCK_ITEMS = [navItem("/today"), navItem("/exercises"), navItem("/progress")] as const;
export const MORE_ITEMS = [navItem("/templates"), navItem("/history"), navItem("/insights"), navItem("/settings")] as const;

/** A path belongs to a nav item when it equals the href or is nested under it (/exercises/abc -> Exercises). */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The swipe ring on phones: only these three top-level pages, in dock order, with no wrap-around. */
export const TAB_RING: readonly string[] = DOCK_ITEMS.map((i) => i.href);

export type NavTransition = "nav-forward" | "nav-back";

/** The neighbouring tab of `pathname` when it is exactly a top-level tab (not a nested or More page), else null. */
export function tabNeighbour(pathname: string, step: 1 | -1): string | null {
  const i = TAB_RING.indexOf(pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname);
  if (i < 0) return null;
  return TAB_RING[i + step] ?? null;
}

/**
 * Which way a dock tap slides, by position: toward a tab further right is forward, toward one further left (or up out of a nested
 * page into its own tab) is back. Pages outside the dock (More) count as forward. A swipe uses the same rule, so both slide alike.
 */
export function dockTransition(pathname: string, href: string): NavTransition {
  const from = DOCK_ITEMS.findIndex((i) => isActive(pathname, i.href));
  const to = DOCK_ITEMS.findIndex((i) => i.href === href);
  if (from < 0 || to < 0) return "nav-forward";
  if (to < from) return "nav-back";
  if (to === from) return pathname === href ? "nav-forward" : "nav-back";
  return "nav-forward";
}
