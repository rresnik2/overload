import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { EdgeSwipeBack, isIosStandalone } from "./EdgeSwipeBack";
import { announceDirection, clearDirection } from "./nav-direction";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36";

function setEnv({ ua, standalone, displayMode = standalone }: { ua: string; standalone?: boolean; displayMode?: boolean }) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(navigator, "standalone", { value: standalone, configurable: true });
  window.matchMedia = ((query: string) => ({ matches: query.includes("display-mode: standalone") ? Boolean(displayMode) : false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
}

describe("isIosStandalone", () => {
  it("is true only for the installed iOS app", () => {
    setEnv({ ua: IPHONE, standalone: true });
    expect(isIosStandalone()).toBe(true);
    setEnv({ ua: IPHONE, standalone: false });
    expect(isIosStandalone()).toBe(false); // Safari tab: the system back swipe exists
    setEnv({ ua: ANDROID, standalone: undefined, displayMode: true });
    expect(isIosStandalone()).toBe(false); // an installed Android app has the system back gesture
  });
});

describe("EdgeSwipeBack", () => {
  let clock = 0;
  beforeEach(() => {
    clock = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    router.back.mockClear();
    Object.defineProperty(window.history, "length", { value: 3, configurable: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete document.documentElement.dataset.edgeBack;
    delete document.documentElement.dataset.edgePeek;
  });

  const drag = (fromX: number, dx: number, ms = 200, release = true) => {
    const base = { pointerId: 1, pointerType: "touch", isPrimary: true };
    fireEvent.pointerDown(document.body, { ...base, clientX: fromX, clientY: 300 });
    for (let i = 1; i <= 4; i++) {
      clock += ms / 4;
      fireEvent.pointerMove(document.body, { ...base, clientX: fromX + (dx * i) / 4, clientY: 300 });
    }
    if (release) fireEvent.pointerUp(document.body, { ...base, clientX: fromX + dx, clientY: 300 });
  };

  it("does nothing outside the installed iPhone app", () => {
    setEnv({ ua: ANDROID });
    render(<EdgeSwipeBack />);
    expect(document.documentElement.dataset.edgeBack).toBeUndefined();
    drag(5, 160);
    expect(router.back).not.toHaveBeenCalled();
  });

  it("follows the finger from the left edge and goes back on release", () => {
    setEnv({ ua: IPHONE, standalone: true });
    render(<EdgeSwipeBack />);
    expect(document.documentElement.dataset.edgeBack).toBe("");
    drag(6, 160, 200, false);
    expect(document.documentElement.dataset.edgePeek).toBe("drag");
    expect(document.documentElement.style.getPropertyValue("--edge-dx")).toBe("160px");
    fireEvent.pointerUp(document.body, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 166, clientY: 300 });
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.edgePeek).toBeUndefined();
  });

  it("snaps back on a short pull and ignores starts away from the edge, leftward drags and an empty history", () => {
    setEnv({ ua: IPHONE, standalone: true });
    render(<EdgeSwipeBack />);
    drag(6, 30, 700);
    expect(router.back).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.edgePeek).toBe("settle");
    drag(120, 160);
    drag(6, -80);
    expect(router.back).not.toHaveBeenCalled();
    Object.defineProperty(window.history, "length", { value: 1, configurable: true });
    drag(6, 160);
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe("announced direction", () => {
  it("is cleared on demand", () => {
    announceDirection("nav-back");
    act(() => clearDirection());
  });
});
