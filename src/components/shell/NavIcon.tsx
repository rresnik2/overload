import { CalendarDays, ChartLine, ClipboardList, Dumbbell, History, Settings, Sparkles, Weight } from "lucide-react";
import type { NavItem } from "./nav";

const ICONS = {
  today: CalendarDays,
  exercises: Dumbbell,
  templates: ClipboardList,
  history: History,
  progress: ChartLine,
  insights: Sparkles,
  settings: Settings,
  workout: Weight,
} as const;

/** Decorative nav icon (always paired with a visible or sr-only label). */
export function NavIcon({ name, size = 22 }: { name: NavItem["icon"]; size?: number }) {
  const Icon = ICONS[name];
  return <Icon size={size} aria-hidden="true" strokeWidth={1.75} />;
}
