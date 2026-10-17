import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoggingGuide } from "./LoggingGuide";

describe("LoggingGuide", () => {
  it("writes the bracketed effort term without a space and keeps it on one line", () => {
    render(<LoggingGuide onClose={() => undefined} />);
    const term = screen.getByRole("button", { name: "reps in reserve" });
    const keep = term.closest(".hint-keep");
    expect(keep).not.toBeNull();
    expect(keep).toHaveTextContent(/^\(reps in reserve\)$/);
  });
});
