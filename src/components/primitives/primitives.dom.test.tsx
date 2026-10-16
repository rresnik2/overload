import Link from "next/link";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";
import { HardCard } from "./HardCard";
import { PageHeader } from "./PageHeader";
import { SectionHeader, formatSectionIndex } from "./SectionHeader";

describe("HardCard", () => {
  it("renders the shell with padding by default and the press state when interactive", () => {
    const { container, rerender } = render(<HardCard data-testid="c">hello</HardCard>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe("DIV");
    expect(el).toHaveClass("hard-card", "hard-card--padded");
    expect(el).not.toHaveClass("hard-card--interactive");
    rerender(
      <HardCard as="article" interactive padded={false} className="extra">
        x
      </HardCard>,
    );
    const next = container.firstElementChild as HTMLElement;
    expect(next.tagName).toBe("ARTICLE");
    expect(next).toHaveClass("hard-card--interactive", "extra");
    expect(next).not.toHaveClass("hard-card--padded");
  });
});

describe("SectionHeader", () => {
  it("formats numeric indexes as zero-padded 'NN/'", () => {
    expect(formatSectionIndex(1)).toBe("01");
    expect(formatSectionIndex(12)).toBe("12");
    expect(formatSectionIndex("A")).toBe("A");
  });

  it("renders 01/Progress with a decorative index and an accessible title", () => {
    const { container } = render(<SectionHeader index={1} title="Progress" />);
    expect(screen.getByRole("heading", { level: 2, name: "Progress" })).toBeInTheDocument();
    expect(container.querySelector(".section-header__index")).toHaveTextContent("01");
    expect(container.querySelector(".section-header__slash")).toHaveTextContent("/");
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
    expect(container.textContent).toBe("01/Progress");
  });

  it("omits the index and supports other levels and an actions slot", () => {
    const { container } = render(<SectionHeader as="h3" title="Recent" actions={<Link href="/history">All</Link>} />);
    expect(screen.getByRole("heading", { level: 3, name: "Recent" })).toBeInTheDocument();
    expect(container.querySelector(".section-header__index")).toBeNull();
    expect(screen.getByRole("link", { name: "All" })).toBeInTheDocument();
  });
});

describe("PageHeader", () => {
  it("renders the title as h1 with a slash-separated meta line", () => {
    const { container } = render(<PageHeader title="Barbell Squat" meta={["Free weight", "Barbell"]} description="The king." actions={<button>Add</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Barbell Squat" })).toBeInTheDocument();
    expect(container.querySelector(".meta-line")).toHaveTextContent("Free weight/Barbell");
    expect(container.querySelectorAll(".meta-line__slash")).toHaveLength(1);
    expect(screen.getByText("The king.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("renders without optional parts", () => {
    const { container } = render(<PageHeader title="Today" />);
    expect(container.querySelector(".meta-line")).toBeNull();
    expect(container.querySelector(".page-header__actions")).toBeNull();
  });
});

describe("EmptyState", () => {
  it("renders the title, description and action", () => {
    render(<EmptyState title="No workouts yet" description="Log your first session." action={<a href="/workout">Start</a>} icon={<svg />} />);
    expect(screen.getByRole("heading", { name: "No workouts yet" })).toBeInTheDocument();
    expect(screen.getByText("Log your first session.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start" })).toBeInTheDocument();
  });
});
