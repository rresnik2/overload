import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { InsightCard as Card } from "@/contracts/analytics";
import { demoFacts } from "@/server/insights/test-support";
import { InsightCard } from "./InsightCard";
import { ReportView } from "./ReportView";

const card: Card = {
  id: "insight:volume-band:QUADRICEPS",
  ruleId: "volume-band",
  severity: "warning",
  title: "Low weekly volume for quadriceps",
  body: "You did 8 fractional sets.",
  evidence: [{ label: "Fractional sets", value: 8, unit: "sets" }],
  citations: ["schoenfeld2017volume", "not-a-real-key"],
};

describe("InsightCard", () => {
  it("spells out severity, hides details until opened, and links only registered citations", () => {
    const { container } = render(<InsightCard card={card} />);
    expect(screen.getByText("Heads up")).toBeTruthy();
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(false);
    const links = within(container).getAllByRole("link", { hidden: true });
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("target")).toBe("_blank");
    expect(links[0]!.getAttribute("href")).toMatch(/^https:\/\//);
    expect(screen.getByText("Fractional sets", { selector: "dt" })).toBeTruthy();
  });
});

describe("ReportView", () => {
  const facts = demoFacts();
  it("shows the rule cards and a notice when there is no narrative", () => {
    render(<ReportView facts={facts} report={null} />);
    expect(screen.getByRole("status").textContent).toMatch(/No written review yet/);
    expect(document.querySelectorAll("details.insight-card").length).toBe(facts.insights.length);
  });
});
