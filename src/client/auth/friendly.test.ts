import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "./messages";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps same-origin paths", () => {
    expect(safeNext("/progress?range=90d")).toBe("/progress?range=90d");
  });
  it.each(["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "", null, undefined])("rejects %s", (value) => {
    expect(safeNext(value)).toBe("/today");
  });
  it("uses the given fallback", () => {
    expect(safeNext("nope", "/continue")).toBe("/continue");
  });
});

describe("friendlyAuthError", () => {
  it("explains rate limits", () => {
    expect(friendlyAuthError({ status: 429 })).toMatch(/too many attempts/i);
  });
  it("maps known codes and falls back to the server message", () => {
    expect(friendlyAuthError({ code: "INVALID_EMAIL_OR_PASSWORD" })).toMatch(/do not match/);
    expect(friendlyAuthError({ message: "Custom" })).toBe("Custom");
    expect(friendlyAuthError(null)).toMatch(/something went wrong/i);
  });
});
