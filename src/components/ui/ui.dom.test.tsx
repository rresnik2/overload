import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Button, buttonClass } from "./Button";
import { Field } from "./Field";
import { NumberStepper } from "./NumberStepper";
import { Sheet } from "./Sheet";
import { Stat } from "./Stat";
import { SyncPipView } from "./SyncPip";
import { ModalityTabs, Tabs, type ModalityTab } from "./Tabs";
import { ToastProvider, useToast } from "./Toast";

describe("Button", () => {
  it("renders variants, blocks activation while loading and exposes aria-busy", async () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Button variant="ink" onClick={onClick}>
        Save
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toHaveClass("ui-btn", "ui-btn--ink");
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <Button variant="ink" loading onClick={onClick}>
        Save
      </Button>,
    );
    const loading = screen.getByRole("button", { name: "Save" });
    expect(loading).toBeDisabled();
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(buttonClass({ variant: "danger", block: true })).toBe("ui-btn ui-btn--danger ui-btn--block");
  });
});

describe("Field", () => {
  it("links label, hint and error, and flags invalid", () => {
    render(<Field label="Weight" kind="weight" unit="kg" hint="Use kg" error="Required" />);
    const input = screen.getByLabelText("Weight");
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const described = input.getAttribute("aria-describedby") ?? "";
    expect(described.split(" ")).toHaveLength(2);
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.getByText("Use kg")).toBeInTheDocument();
  });
});

function Stepper({ initial = 80, step = 2.5, max }: { initial?: number | null; step?: number; max?: number }) {
  const [v, setV] = useState<number | null>(initial);
  return (
    <>
      <NumberStepper label="Weight" kind="weight" unit="kg" step={step} value={v} onChange={setV} max={max} />
      <output data-testid="out">{v === null ? "null" : v}</output>
    </>
  );
}

describe("NumberStepper", () => {
  it("steps by the given increment without float noise and clamps at min/max", async () => {
    render(<Stepper initial={0.2} step={0.1} />);
    await userEvent.click(screen.getByRole("button", { name: "Increase Weight" }));
    expect(screen.getByTestId("out")).toHaveTextContent("0.3");
    await userEvent.click(screen.getByRole("button", { name: "Decrease Weight" }));
    await userEvent.click(screen.getByRole("button", { name: "Decrease Weight" }));
    await userEvent.click(screen.getByRole("button", { name: "Decrease Weight" }));
    expect(screen.getByTestId("out")).toHaveTextContent("0");
    expect(screen.getByRole("button", { name: "Decrease Weight" })).toBeDisabled();
  });

  it("accepts typed decimals (comma too), allows clearing, and rejects letters", async () => {
    render(<Stepper initial={null} />);
    const input = screen.getByLabelText("Weight");
    await userEvent.click(input);
    await userEvent.type(input, "82,5");
    expect(screen.getByTestId("out")).toHaveTextContent("82.5");
    await userEvent.type(input, "abc");
    expect(input).toHaveValue("82,5");
    await userEvent.clear(input);
    expect(screen.getByTestId("out")).toHaveTextContent("null");
  });

  it("supports arrow keys and respects max", async () => {
    render(<Stepper initial={99} step={2} max={100} />);
    const input = screen.getByLabelText("Weight");
    await userEvent.click(input);
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByTestId("out")).toHaveTextContent("100");
    expect(screen.getByRole("button", { name: "Increase Weight" })).toBeDisabled();
  });
});

describe("Stat", () => {
  it("shows the numeral, label and PR star text; loading hides the value", () => {
    const { rerender } = render(<Stat label="Estimated 1RM" value="142.5" unit="kg" pr />);
    expect(screen.getByText("142.5")).toBeInTheDocument();
    expect(screen.getByText("Personal record")).toHaveClass("sr-only");
    rerender(<Stat label="Estimated 1RM" value="142.5" loading />);
    expect(screen.queryByText("142.5")).not.toBeInTheDocument();
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });
});

describe("Tabs", () => {
  it("is keyboard navigable (arrows, Home/End), skips disabled tabs and shows the active panel", async () => {
    render(
      <Tabs
        label="Views"
        items={[
          { id: "a", label: "A", panel: <p>panel a</p> },
          { id: "b", label: "B", panel: <p>panel b</p>, disabled: true },
          { id: "c", label: "C", panel: <p>panel c</p> },
        ]}
      />,
    );
    const a = screen.getByRole("tab", { name: "A" });
    expect(a).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel a");
    a.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "C" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel c");
    await userEvent.keyboard("{Home}");
    expect(a).toHaveAttribute("aria-selected", "true");
  });

  it("ModalityTabs lists the four modalities and reports the selection", async () => {
    const seen: ModalityTab[] = [];
    function Harness() {
      const [m, setM] = useState<ModalityTab>("FREE_WEIGHT");
      return (
        <ModalityTabs
          value={m}
          onChange={(next) => {
            seen.push(next);
            setM(next);
          }}
        />
      );
    }
    render(<Harness />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Free weight", "Machine", "Cable", "Bodyweight"]);
    await userEvent.click(screen.getByRole("tab", { name: "Cable" }));
    expect(seen).toEqual(["CABLE"]);
  });
});

describe("Toast", () => {
  function Trigger({ kind }: { kind: "pr" | "error" }) {
    const { toast } = useToast();
    return <button onClick={() => toast({ kind, title: `A ${kind} happened`, duration: 0 })}>fire</button>;
  }
  it("announces through a live region; errors use role=alert, others role=status; dismissable", async () => {
    render(
      <ToastProvider>
        <Trigger kind="pr" />
        <Trigger kind="error" />
      </ToastProvider>,
    );
    expect(screen.getByRole("region", { name: "Notifications" })).toHaveAttribute("aria-live", "polite");
    const [firePr, fireErr] = screen.getAllByText("fire");
    await userEvent.click(firePr!);
    await userEvent.click(fireErr!);
    expect(screen.getByRole("alert")).toHaveTextContent("A error happened");
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("A pr happened");
    await userEvent.click(screen.getAllByRole("button", { name: "Dismiss notification" })[0]!);
    expect(screen.queryByText("A pr happened")).not.toBeInTheDocument();
  });
});

describe("SyncPipView", () => {
  it("renders a distinct label for every state and the pending count when offline", () => {
    const { rerender } = render(<SyncPipView state="idle" />);
    expect(screen.getByRole("status")).toHaveTextContent("Synced");
    rerender(<SyncPipView state="offline" pendingCount={3} />);
    expect(screen.getByRole("status")).toHaveTextContent("Offline, 3 waiting");
    rerender(<SyncPipView state="error" />);
    expect(screen.getByRole("status")).toHaveTextContent("Sync error");
    rerender(<SyncPipView state="signed-out" compact />);
    expect(screen.getByText("Signed out")).toHaveClass("sr-only");
  });
});

describe("Sheet", () => {
  beforeAll(() => {
    // jsdom has no modal <dialog>: emulate open/close so the component's effect and close event can be exercised.
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  });

  it("opens with showModal, is labelled by its title, and closes via the button", async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Sheet open={false} onClose={onClose} title="Rest timer">
        body
      </Sheet>,
    );
    expect(document.querySelector("dialog")).not.toHaveAttribute("open");
    rerender(
      <Sheet open onClose={onClose} title="Rest timer">
        body
      </Sheet>,
    );
    const dialog = document.querySelector("dialog")!;
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveAttribute("aria-labelledby");
    expect(screen.getByRole("dialog", { name: "Rest timer" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
    await act(async () => {});
  });
});
