import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTipsEnabled } from "@/components/ui/tips";
import { GLOSSARY } from "@/lib/glossary";
import { InfoHint } from "./InfoHint";
import { PageIntro } from "./PageIntro";
import { Term } from "./Term";

function mockPointer(fine: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: fine && query.includes("hover: hover"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("InfoHint", () => {
  beforeEach(() => mockPointer(false));

  it("is a button named after the term, closed until used, with aria-expanded", () => {
    render(<InfoHint term="rir" />);
    const btn = screen.getByRole("button", { name: `What is ${GLOSSARY.rir.term}?` });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn).not.toHaveAttribute("aria-controls");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on tap as a disclosure, links aria-controls to it, and closes on a second tap", async () => {
    const user = userEvent.setup();
    render(<InfoHint term="rir" />);
    const btn = screen.getByRole("button");
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    const pop = screen.getByRole("group", { name: GLOSSARY.rir.term });
    expect(btn).toHaveAttribute("aria-controls", pop.id);
    expect(pop).toHaveTextContent(GLOSSARY.rir.short);
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("closes on Escape and returns focus to the button", async () => {
    const user = userEvent.setup();
    render(<InfoHint term="e1rm" />);
    const btn = screen.getByRole("button");
    await user.click(btn);
    expect(screen.getByRole("group")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group")).toBeNull();
    expect(btn).toHaveFocus();
  });

  it("closes when you tap or click outside it, but not when you tap inside the popover", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <InfoHint term="rir" />
        <p>elsewhere</p>
      </div>,
    );
    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("group"));
    expect(screen.getByRole("group")).toBeInTheDocument();
    await user.click(screen.getByText("elsewhere"));
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("does not open on touch pointer-enter (hover is for fine pointers only)", () => {
    render(<InfoHint term="rir" />);
    fireEvent.pointerEnter(screen.getByRole("button"), { pointerType: "touch" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows a Learn more link only when the glossary has an article for the term", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<InfoHint term="rir" />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("link", { name: "Learn more" })).toHaveAttribute("href", "/learn/rir");
    unmount();
    render(<InfoHint term="restTimer" />);
    await user.click(screen.getByRole("button"));
    expect(screen.queryByRole("link", { name: "Learn more" })).toBeNull();
  });
});

describe("InfoHint with a mouse", () => {
  beforeEach(() => mockPointer(true));

  it("shows a tooltip on hover, keeps it while the pointer is over it, and hides it shortly after leaving", () => {
    vi.useFakeTimers();
    render(<InfoHint term="rir" />);
    const btn = screen.getByRole("button");
    fireEvent.pointerEnter(btn, { pointerType: "mouse" });
    const tip = screen.getByRole("tooltip");
    expect(btn).toHaveAttribute("aria-describedby", tip.id);
    fireEvent.pointerLeave(btn, { pointerType: "mouse" });
    fireEvent.pointerEnter(tip, { pointerType: "mouse" });
    act(() => void vi.advanceTimersByTime(400));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerLeave(tip, { pointerType: "mouse" });
    act(() => void vi.advanceTimersByTime(400));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows a tooltip on keyboard focus and hides it on blur", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <InfoHint term="rir" />
        <button type="button">next</button>
      </div>,
    );
    await user.tab();
    expect(screen.getByRole("tooltip")).toHaveTextContent(GLOSSARY.rir.short);
    await user.tab(); // into the Learn more link
    await user.tab(); // out of the popover
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("pins on click so it stays after the pointer leaves", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<InfoHint term="rir" />);
    const btn = screen.getByRole("button");
    await user.hover(btn);
    await user.click(btn);
    await user.unhover(btn);
    act(() => void vi.advanceTimersByTime(400));
    expect(screen.getByRole("group")).toBeInTheDocument();
  });
});

describe("Term", () => {
  beforeEach(() => mockPointer(false));
  it("renders the words inline as a button and opens the same popover on tap", async () => {
    const user = userEvent.setup();
    render(
      <p>
        Log your <Term id="rir">RIR</Term> after each set.
      </p>,
    );
    const btn = screen.getByRole("button", { name: "RIR" });
    expect(btn.closest("p")).not.toBeNull();
    await user.click(btn);
    expect(screen.getByRole("group", { name: GLOSSARY.rir.term })).toHaveTextContent(GLOSSARY.rir.short);
    // the popover is made of spans only, so it is valid inside a <p>
    expect(screen.getByRole("group").tagName).toBe("SPAN");
  });
});

describe("PageIntro", () => {
  it("shows its text, hides when dismissed, remembers it, and comes back with Show tips", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<PageIntro id="today">Start here.</PageIntro>);
    expect(screen.getByText("Start here.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText("Start here.")).toBeNull();
    unmount();
    render(<PageIntro id="today">Start here.</PageIntro>);
    expect(screen.queryByText("Start here.")).toBeNull();
    act(() => setTipsEnabled(true));
    expect(screen.getByText("Start here.")).toBeInTheDocument();
  });

  it("hides every intro when tips are switched off, and still renders when storage throws", () => {
    act(() => setTipsEnabled(false));
    const { unmount } = render(<PageIntro id="history">Your log.</PageIntro>);
    expect(screen.queryByText("Your log.")).toBeNull();
    unmount();
    act(() => setTipsEnabled(true));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<PageIntro id="history">Your log.</PageIntro>);
    expect(screen.getByText("Your log.")).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
