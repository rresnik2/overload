import { describe, expect, it } from "vitest";
import { classifyIntent, resolveSwipe, shouldClaimTouch } from "./swipe-logic";

describe("classifyIntent", () => {
  it("waits below the slop", () => {
    expect(classifyIntent(6, 2)).toBe("pending");
    expect(classifyIntent(0, 0)).toBe("pending");
  });
  it("is horizontal only when |dx| > 1.5 |dy|", () => {
    expect(classifyIntent(30, 10)).toBe("horizontal");
    expect(classifyIntent(-30, 10)).toBe("horizontal");
    expect(classifyIntent(30, 19)).toBe("horizontal");
    expect(classifyIntent(30, 20)).toBe("pending");
  });
  it("is vertical as soon as the move is more vertical than horizontal", () => {
    expect(classifyIntent(5, 30)).toBe("vertical");
    expect(classifyIntent(20, 20)).toBe("vertical");
  });
  it("keeps a 1:1 to 1.5:1 diagonal pending", () => {
    expect(classifyIntent(35, 30)).toBe("pending");
  });
});

describe("resolveSwipe", () => {
  it("commits on distance", () => {
    expect(resolveSwipe(-64, 4, 800)).toBe("left");
    expect(resolveSwipe(80, -10, 900)).toBe("right");
  });
  it("rejects a short, slow move", () => {
    expect(resolveSwipe(-63, 0, 800)).toBeNull();
    expect(resolveSwipe(40, 0, 800)).toBeNull();
  });
  it("commits a short fling", () => {
    expect(resolveSwipe(-40, 5, 60)).toBe("left");
    expect(resolveSwipe(30, 0, 40)).toBe("right");
  });
  it("ignores a move that is too tiny to be a fling", () => {
    expect(resolveSwipe(10, 0, 5)).toBeNull();
  });
  it("rejects a diagonal even when long", () => {
    expect(resolveSwipe(-90, 70, 200)).toBeNull();
    expect(resolveSwipe(-90, 60, 200)).toBeNull();
    expect(resolveSwipe(-90, 59, 200)).toBe("left");
  });
});

describe("shouldClaimTouch (iOS)", () => {
  it("claims a touch once it is clearly sideways, either way", () => {
    expect(shouldClaimTouch(-6, 2)).toBe(true);
    expect(shouldClaimTouch(8, -5)).toBe(true);
  });

  it("never claims a vertical or diagonal-vertical touch, or one that has barely moved", () => {
    expect(shouldClaimTouch(5, 0)).toBe(false);
    expect(shouldClaimTouch(2, 9)).toBe(false);
    expect(shouldClaimTouch(7, 7)).toBe(false);
  });
});
