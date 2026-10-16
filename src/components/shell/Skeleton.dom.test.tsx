import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TodayLoading from "@/app/(app)/today/loading";
import { Skel, SkeletonHeader, SkeletonPage } from "./Skeleton";

describe("route skeletons", () => {
  it("announce one loading status and hide the drawing from assistive technology", () => {
    const { container } = render(
      <SkeletonPage label="exercises">
        <SkeletonHeader title="Exercises" meta="Library / All" action />
        <Skel className="skel--filters" />
      </SkeletonPage>,
    );
    expect(screen.getByRole("status").textContent).toContain("Loading exercises");
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toContain("Exercises");
  });

  it("never exposes a heading, so a page waiting for its real h1 is not satisfied by the skeleton", () => {
    render(<TodayLoading />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(document.querySelector(".today-grid .skel")).not.toBeNull();
  });

  it("gives the description a line count for phones and one for wide screens", () => {
    const { container } = render(<SkeletonHeader title="Progress" lines={3} linesWide={2} />);
    const style = (container.querySelector(".skel-desc") as HTMLElement).style;
    expect(style.getPropertyValue("--skel-lines")).toBe("3");
    expect(style.getPropertyValue("--skel-lines-wide")).toBe("2");
  });
});
