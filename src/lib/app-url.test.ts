import { describe, expect, it } from "vitest";
import { resolveAppUrl } from "./app-url";

describe("resolveAppUrl", () => {
  it("uses an explicit URL and trims a trailing slash", () => {
    expect(resolveAppUrl({ BETTER_AUTH_URL: "https://overloadfit.vercel.app/" })).toBe("https://overloadfit.vercel.app");
  });

  it("prefers BETTER_AUTH_URL over NEXT_PUBLIC_APP_URL", () => {
    expect(resolveAppUrl({ BETTER_AUTH_URL: "https://a.example", NEXT_PUBLIC_APP_URL: "https://b.example" })).toBe("https://a.example");
  });

  it("treats an empty value as unset", () => {
    expect(resolveAppUrl({ BETTER_AUTH_URL: "", NEXT_PUBLIC_APP_URL: "https://b.example" })).toBe("https://b.example");
  });

  it("ignores a localhost value on Vercel production and uses the production domain", () => {
    expect(
      resolveAppUrl({
        VERCEL_ENV: "production",
        BETTER_AUTH_URL: "http://localhost:3000",
        VERCEL_PROJECT_PRODUCTION_URL: "overloadfit.vercel.app",
        VERCEL_URL: "overload-abc123.vercel.app",
      }),
    ).toBe("https://overloadfit.vercel.app");
  });

  it("uses the deployment URL on previews", () => {
    expect(resolveAppUrl({ VERCEL_ENV: "preview", VERCEL_URL: "overload-git-x.vercel.app" })).toBe("https://overload-git-x.vercel.app");
  });

  it("keeps localhost for local development", () => {
    expect(resolveAppUrl({})).toBe("http://localhost:3000");
    expect(resolveAppUrl({ BETTER_AUTH_URL: "http://localhost:3003" })).toBe("http://localhost:3003");
  });
});
