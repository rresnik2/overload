import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorPage from "@/app/error";
import { SafeBoundary } from "./SafeBoundary";

function Boom(): never {
  throw new Error("plates is undefined");
}

afterEach(() => vi.restoreAllMocks());

describe("SafeBoundary", () => {
  it("shows the fallback with the error instead of throwing, and logs it", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <p>
        before
        <SafeBoundary label="Next up" fallback={(e) => <span>fallback: {e.message}</span>}>
          <Boom />
        </SafeBoundary>
      </p>,
    );
    expect(screen.getByText("fallback: plates is undefined")).toBeInTheDocument();
    expect(log.mock.calls.some((c) => String(c[0]).includes("[Next up] failed to render"))).toBe(true);
  });

  it("renders nothing by default", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container } = render(
      <SafeBoundary label="drawing">
        <Boom />
      </SafeBoundary>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the error page", () => {
  it("shows a browser error's message under Details, but never a server error's (it only has a digest)", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { unmount } = render(<ErrorPage error={new Error("Cannot read properties of undefined (reading 'filter')")} reset={() => undefined} />);
    expect(screen.getByText("Cannot read properties of undefined (reading 'filter')")).toBeInTheDocument();
    unmount();
    render(<ErrorPage error={Object.assign(new Error("hidden"), { digest: "123" })} reset={() => undefined} />);
    expect(screen.queryByText("hidden")).toBeNull();
    expect(screen.getByText("Reference 123")).toBeInTheDocument();
  });
});
