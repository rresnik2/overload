import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const status = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", () => ({ useLinkStatus: () => status }));

import { LinkPending } from "./LinkPending";

describe("LinkPending", () => {
  it("is always rendered, decorative, and only marked pending while the link is loading", () => {
    status.pending = false;
    const { container, rerender } = render(<LinkPending />);
    const el = container.querySelector(".link-pending");
    expect(el).not.toBeNull();
    expect(el?.getAttribute("aria-hidden")).toBe("true");
    expect(el?.hasAttribute("data-pending")).toBe(false);

    status.pending = true;
    rerender(<LinkPending placement="bottom" />);
    expect(container.querySelector(".link-pending")?.getAttribute("data-pending")).toBe("true");
    expect(container.querySelector(".link-pending")?.getAttribute("data-placement")).toBe("bottom");
  });
});
