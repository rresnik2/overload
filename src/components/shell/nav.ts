// Navigation model shared by the desktop navbar, the mobile dock and the "More" sheet. PURE data.
export interface NavItem {
  href: string;
  label: string;
  /** lucide icon name, resolved in NavIcon (keeps this file free of React). */
  icon: "today" | "exercises" | "history" | "progress" | "insights" | "settings" | "workout";
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/today", label: "Today", icon: "today" },
  { href: "/exercises", label: "Exercises", icon: "exercises" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/progress", label: "Progress", icon: "progress" },
  { href: "/insights", label: "Insights", icon: "insights" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export const START_WORKOUT: NavItem = { href: "/workout", label: "Start workout", icon: "workout" };

/** Dock slots on mobile: four destinations around the Start action; the rest live behind "More". */
export const DOCK_ITEMS = [NAV_ITEMS[0], NAV_ITEMS[1], NAV_ITEMS[3]] as const;
export const MORE_ITEMS = [NAV_ITEMS[2], NAV_ITEMS[4], NAV_ITEMS[5]] as const;

/** A path belongs to a nav item when it equals the href or is nested under it (/exercises/abc -> Exercises). */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
