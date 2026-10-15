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
