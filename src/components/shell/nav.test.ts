import { describe, expect, it } from "vitest";
import { dockTransition, DOCK_ITEMS, isActive, MORE_ITEMS, NAV_ITEMS, START_WORKOUT, tabNeighbour } from "./nav";

describe("nav model", () => {
  it("matches a path to its item, including nested routes, but not look-alike prefixes", () => {
    expect(isActive("/exercises", "/exercises")).toBe(true);
    expect(isActive("/exercises/abc", "/exercises")).toBe(true);
    expect(isActive("/exercises-old", "/exercises")).toBe(false);
    expect(isActive("/today", "/history")).toBe(false);
  });

  it("every destination is reachable on mobile: dock + More cover all items", () => {
    const covered = new Set([...DOCK_ITEMS, ...MORE_ITEMS].map((i) => i.href));
    expect([...covered].sort()).toEqual(NAV_ITEMS.map((i) => i.href).sort());
    expect(START_WORKOUT.href).toBe("/workout");
  });
});

describe("tab swipe ring", () => {
  it("is Today, Exercises, Progress with no wrap-around", () => {
    expect(tabNeighbour("/today", 1)).toBe("/exercises");
    expect(tabNeighbour("/exercises", 1)).toBe("/progress");
    expect(tabNeighbour("/progress", 1)).toBeNull();
    expect(tabNeighbour("/progress", -1)).toBe("/exercises");
    expect(tabNeighbour("/today", -1)).toBeNull();
  });

  it("does not apply to nested or More pages", () => {
    expect(tabNeighbour("/exercises/abc", 1)).toBeNull();
    expect(tabNeighbour("/progress/lift", -1)).toBeNull();
    expect(tabNeighbour("/history", 1)).toBeNull();
    expect(tabNeighbour("/settings/profile", -1)).toBeNull();
  });
});

describe("dockTransition", () => {
  it("slides by position relative to the current tab", () => {
    expect(dockTransition("/today", "/exercises")).toBe("nav-forward");
    expect(dockTransition("/today", "/progress")).toBe("nav-forward");
    expect(dockTransition("/progress", "/exercises")).toBe("nav-back");
    expect(dockTransition("/exercises", "/today")).toBe("nav-back");
  });

  it("treats going up out of a nested page as back and the rest as forward", () => {
    expect(dockTransition("/exercises/abc", "/exercises")).toBe("nav-back");
    expect(dockTransition("/exercises/abc", "/progress")).toBe("nav-forward");
    expect(dockTransition("/history", "/today")).toBe("nav-forward");
    expect(dockTransition("/today", "/today")).toBe("nav-forward");
  });
});
