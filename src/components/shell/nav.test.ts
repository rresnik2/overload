import { describe, expect, it } from "vitest";
import { DOCK_ITEMS, isActive, MORE_ITEMS, NAV_ITEMS, START_WORKOUT } from "./nav";

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
