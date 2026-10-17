import { describe, expect, it } from "vitest";
import { currentPageVersion, registerPageVersion } from "./page-version";

describe("page version registry", () => {
  it("is null with no page mounted, and follows register and unregister", () => {
    expect(currentPageVersion()).toBeNull();
    const off = registerPageVersion(42);
    expect(currentPageVersion()).toBe(42);
    off();
    expect(currentPageVersion()).toBeNull();
  });

  it("reports the lowest version while two pages are mounted, so the safe side refreshes", () => {
    const a = registerPageVersion(120);
    const b = registerPageVersion(100);
    expect(currentPageVersion()).toBe(100);
    b();
    expect(currentPageVersion()).toBe(120);
    a();
    expect(currentPageVersion()).toBeNull();
  });

  it("unregistering twice does not remove another page's entry", () => {
    const a = registerPageVersion(7);
    const b = registerPageVersion(9);
    a();
    a();
    expect(currentPageVersion()).toBe(9);
    b();
  });
});
