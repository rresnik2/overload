// Display helpers for insight reports. Pure.
import type { InsightSeverity } from "@/contracts/analytics";
import type { InsightFacts } from "@/contracts/insights";
import { addDays } from "@/lib/dates";

export const SEVERITY_LABEL: Record<InsightSeverity, string> = {
  info: "Info",
  suggestion: "Suggestion",
  warning: "Heads up",
  celebration: "Win",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(localDate: string): string {
  const [, m, d] = localDate.split("-").map(Number) as [number, number, number];
  return `${MONTHS[m - 1]} ${d}`;
}

/** "Oct 5 to Oct 11" for the ISO week starting `weekStart`. */
export function weekRangeLabel(weekStart: string): string {
  return `${shortDate(weekStart)} to ${shortDate(addDays(weekStart, 6))}`;
}

const titleCase = (s: string) => s.toLowerCase().replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());

/** A readable name for a factRef id ("volume:QUADRICEPS" -> "Volume: Quadriceps"). */
export function factRefLabel(id: string, facts: InsightFacts): string {
  if (id === "lifter") return "Your profile";
  if (id === "training") return "Training this week";
  if (id === "body") return "Body";
  if (id.startsWith("volume:")) return `Volume: ${titleCase(id.slice(7))}`;
  if (id.startsWith("lift:")) {
    const lift = facts.lifts.find((l) => l.id === id);
    return lift ? `Lift: ${lift.name}${lift.machineLabel ? ` (${lift.machineLabel})` : ""}` : "Lift";
  }
  if (id.startsWith("pr:")) {
    const pr = facts.prs.find((p) => p.id === id);
    return pr ? `PR: ${pr.exerciseName}` : "Personal record";
  }
  if (id.startsWith("insight:")) return facts.insights.find((i) => i.id === id)?.title ?? "Insight";
  return id;
}
