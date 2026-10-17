import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/today" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("next/link", () => ({
  default: ({ href, transitionTypes, children, ...rest }: { href: string; transitionTypes?: string[]; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} data-types={transitionTypes?.join(" ")} {...rest}>
      {children}
    </a>
  ),
  // LinkPending (rendered inside each dock link) reads the link's status.
  useLinkStatus: () => ({ pending: false }),
}));

vi.mock("./ThemeToggle", () => ({ ThemeToggle: () => null }));

import { Dock } from "./Dock";

const typesOf = (name: string) => screen.getByRole("link", { name }).getAttribute("data-types");

describe("Dock link transitions", () => {
  beforeEach(() => {
    nav.pathname = "/today";
  });

  it("from Today every other tab slides forward", () => {
    render(<Dock />);
    expect(typesOf("Exercises")).toBe("nav-forward");
    expect(typesOf("Progress")).toBe("nav-forward");
  });

  it("from Progress the tabs to its left slide back, as a swipe right would", () => {
    nav.pathname = "/progress";
    render(<Dock />);
    expect(typesOf("Today")).toBe("nav-back");
    expect(typesOf("Exercises")).toBe("nav-back");
  });

  it("from Exercises: Today is back and Progress is forward", () => {
    nav.pathname = "/exercises";
    render(<Dock />);
    expect(typesOf("Today")).toBe("nav-back");
    expect(typesOf("Progress")).toBe("nav-forward");
  });

  it("from a nested page, its own tab is back", () => {
    nav.pathname = "/exercises/abc";
    render(<Dock />);
    expect(typesOf("Exercises")).toBe("nav-back");
  });
});
