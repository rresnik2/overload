import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirm, isHapticsEnabled, resetHapticsForTests, setHapticsEnabled, THROTTLE_MS, tick, useHapticsEnabled } from "./haptics";

class FakeStorage {
  data = new Map<string, string>();
  throws = false;
  getItem(k: string) {
    if (this.throws) throw new Error("denied");
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.throws) throw new Error("denied");
    this.data.set(k, v);
  }
  removeItem(k: string) {
    if (this.throws) throw new Error("denied");
    this.data.delete(k);
  }
}

/** A minimal DOM: just enough for the iOS switch label (create, append, click). */
function fakeDocument() {
  const clicks = { count: 0 };
  const made: { tag: string; attrs: Record<string, string>; type?: string; children: unknown[] }[] = [];
  const document = {
    createElement(tag: string) {
      const el = {
        tag,
        attrs: {} as Record<string, string>,
        children: [] as unknown[],
        style: { cssText: "" },
        isConnected: false,
        tabIndex: 0,
        type: "",
        setAttribute(k: string, v: string) {
          this.attrs[k] = v;
        },
        appendChild(c: unknown) {
          this.children.push(c);
          return c;
        },
        click() {
          clicks.count += 1;
        },
      };
      made.push(el);
      return el;
    },
    body: {
      appendChild(el: { isConnected: boolean }) {
        el.isConnected = true;
        return el;
      },
    },
  };
  return { document, clicks, made };
}

let storage: FakeStorage;
let win: EventTarget & { localStorage: FakeStorage };

function setNavigator(nav: Record<string, unknown>) {
  vi.stubGlobal("navigator", nav);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  storage = new FakeStorage();
  win = Object.assign(new EventTarget(), { localStorage: storage });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", undefined);
  resetHapticsForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Android (Vibration API)", () => {
  it("tick vibrates 6 ms and confirm vibrates [12, 60, 12]", () => {
    const vibrate = vi.fn(() => true);
    setNavigator({ vibrate, userAgent: "Android" });
    tick();
    expect(vibrate).toHaveBeenLastCalledWith(6);
    vi.advanceTimersByTime(100);
    confirm();
    expect(vibrate).toHaveBeenLastCalledWith([12, 60, 12]);
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it("throttles ticks to one every 35 ms", () => {
    const vibrate = vi.fn(() => true);
    setNavigator({ vibrate });
    tick();
    vi.advanceTimersByTime(THROTTLE_MS - 1);
    tick();
    expect(vibrate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    tick();
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it("confirm is not throttled by a recent tick", () => {
    const vibrate = vi.fn(() => true);
    setNavigator({ vibrate });
    tick();
    confirm();
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it("never throws when vibrate does", () => {
    setNavigator({
      vibrate: () => {
        throw new Error("blocked");
      },
    });
    expect(() => tick()).not.toThrow();
    expect(() => confirm()).not.toThrow();
  });
});

describe("iOS (checkbox switch)", () => {
  const iphone = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" };

  it("clicks a hidden switch label once per tick, creating it once", () => {
    const { document, clicks, made } = fakeDocument();
    vi.stubGlobal("document", document);
    setNavigator(iphone);
    tick();
    vi.advanceTimersByTime(50);
    tick();
    expect(clicks.count).toBe(2);
    const input = made.find((m) => m.tag === "input");
    expect(input?.type).toBe("checkbox");
    expect(input?.attrs).toHaveProperty("switch");
    expect(made.filter((m) => m.tag === "label")).toHaveLength(1);
    expect(made.find((m) => m.tag === "label")?.attrs["aria-hidden"]).toBe("true");
  });

  it("confirm is a double tap", () => {
    const { document, clicks } = fakeDocument();
    vi.stubGlobal("document", document);
    setNavigator(iphone);
    confirm();
    expect(clicks.count).toBe(1);
    vi.advanceTimersByTime(100);
    expect(clicks.count).toBe(2);
  });

  it("treats an iPad with a Mac user agent as iOS", () => {
    const { document, clicks } = fakeDocument();
    vi.stubGlobal("document", document);
    setNavigator({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 5 });
    tick();
    expect(clicks.count).toBe(1);
  });

  it("never throws when the DOM misbehaves", () => {
    vi.stubGlobal("document", {
      createElement() {
        throw new Error("no dom");
      },
    });
    setNavigator(iphone);
    expect(() => tick()).not.toThrow();
    expect(() => confirm()).not.toThrow();
    vi.advanceTimersByTime(200);
  });
});

describe("other browsers", () => {
  it("is a silent no-op on a desktop", () => {
    const { document, clicks } = fakeDocument();
    vi.stubGlobal("document", document);
    setNavigator({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 0 });
    expect(() => {
      tick();
      confirm();
    }).not.toThrow();
    expect(clicks.count).toBe(0);
  });

  it("does nothing without a navigator", () => {
    vi.stubGlobal("navigator", undefined);
    expect(() => tick()).not.toThrow();
  });
});

describe("enabled flag", () => {
  it("defaults to on and is stored under overload:haptics-off", () => {
    expect(isHapticsEnabled()).toBe(true);
    setHapticsEnabled(false);
    expect(storage.data.get("overload:haptics-off")).toBe("1");
    expect(isHapticsEnabled()).toBe(false);
    setHapticsEnabled(true);
    expect(storage.data.has("overload:haptics-off")).toBe(false);
    expect(isHapticsEnabled()).toBe(true);
  });

  it("silences tick and confirm when off", () => {
    const vibrate = vi.fn(() => true);
    setNavigator({ vibrate });
    setHapticsEnabled(false);
    tick();
    confirm();
    expect(vibrate).not.toHaveBeenCalled();
    setHapticsEnabled(true);
    tick();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("notifies subscribers through a window event", () => {
    const seen = vi.fn();
    win.addEventListener("overload:haptics-changed", seen);
    setHapticsEnabled(false);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("survives unavailable storage (stays on, never throws)", () => {
    storage.throws = true;
    const vibrate = vi.fn(() => true);
    setNavigator({ vibrate });
    expect(isHapticsEnabled()).toBe(true);
    expect(() => setHapticsEnabled(false)).not.toThrow();
    tick();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("the hook reads on during server render", () => {
    function Probe() {
      return createElement("span", null, String(useHapticsEnabled()));
    }
    expect(renderToString(createElement(Probe))).toContain("true");
  });
});
