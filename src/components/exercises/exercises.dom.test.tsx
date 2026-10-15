import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ExerciseRow } from "@/contracts/entities";
import { ExerciseCard } from "./ExerciseCard";
import { ExerciseDetail } from "./ExerciseDetail";
import { ExerciseFilters } from "./ExerciseFilters";
import { ExerciseList } from "./ExerciseList";
import { exerciseMetaParts } from "./labels";
import { DEFAULT_FILTERS } from "./library-url";
import { ModalityBadge } from "./ModalityBadge";
import { MuscleChips } from "./MuscleChips";
import { Pagination } from "./Pagination";

const base: ExerciseRow = {
  id: "00000000-0000-4000-8000-000000000001",
  isCustom: false,
  sourceId: "Barbell_Squat",
  slug: "barbell-squat",
  name: "Barbell Squat",
  aliases: [],
  modality: "FREE_WEIGHT",
  equipment: "BARBELL",
  loadType: "TOTAL",
  tracking: "LOAD_REPS",
  bodyweightFactor: null,
  isUnilateral: false,
  mechanic: "COMPOUND",
  force: "PUSH",
  level: "INTERMEDIATE",
  category: "POWERLIFTING",
  standardLift: "SQUAT",
  instructions: ["Unrack the bar.", "Squat down."],
  images: ["Barbell_Squat/0.jpg"],
  muscles: [
    { muscle: "GLUTES", role: "SECONDARY" },
    { muscle: "QUADRICEPS", role: "PRIMARY" },
  ],
  hlc: "",
  fieldHlc: {},
  version: 0,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const legPress: ExerciseRow = {
  ...base,
  id: "00000000-0000-4000-8000-000000000002",
  name: "Leg Press",
  slug: "leg-press",
  modality: "MACHINE",
  equipment: "MACHINE_PLATE_LOADED",
  loadType: "PLATES_PER_SIDE",
  standardLift: null,
};

describe("ModalityBadge", () => {
  it("names the modality, appends distinct equipment, and tags machines apart from free weights", () => {
    const { container, rerender } = render(<ModalityBadge modality="FREE_WEIGHT" equipment="BARBELL" />);
    expect(container.firstElementChild).toHaveTextContent("Free weight/Barbell");
    expect(container.firstElementChild).toHaveAttribute("data-modality", "FREE_WEIGHT");
    expect(container.firstElementChild).not.toHaveClass("modality-badge--machine");
    rerender(<ModalityBadge modality="MACHINE" equipment="MACHINE_PLATE_LOADED" />);
    expect(container.firstElementChild).toHaveClass("modality-badge--machine");
    rerender(<ModalityBadge modality="CABLE" equipment="CABLE" />);
    expect(container.firstElementChild).toHaveTextContent(/^Cable$/);
  });
});

describe("exerciseMetaParts", () => {
  it("collapses a repeated modality/equipment", () => {
    expect(exerciseMetaParts(base)).toEqual(["Free weight", "Barbell"]);
    expect(exerciseMetaParts({ modality: "CABLE", equipment: "CABLE" })).toEqual(["Cable"]);
  });
});

describe("MuscleChips", () => {
  it("lists primary muscles first and collapses the rest past max", () => {
    render(<MuscleChips muscles={base.muscles} />);
    const items = within(screen.getByRole("list", { name: "Muscles trained" })).getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual(["Quadriceps", "Glutes"]);
  });

  it("shows +N for hidden muscles and renders nothing when empty", () => {
    const { container, rerender } = render(<MuscleChips muscles={base.muscles} max={1} />);
    expect(screen.getByText("+1")).toBeInTheDocument();
    rerender(<MuscleChips muscles={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ExerciseCard / ExerciseList", () => {
  it("links the card to its detail page and shows name, tag and muscles", () => {
    render(<ExerciseCard exercise={base} href="/exercises/abc" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/exercises/abc");
    expect(link).toHaveTextContent("Barbell Squat");
    expect(link).toHaveTextContent("Quadriceps");
  });

  it("without href it is static and carries the picker's actions", () => {
    render(<ExerciseCard exercise={base} showImage={false} actions={<button>Add</button>} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("renders a grid, or an empty state with a message", () => {
    const { rerender } = render(<ExerciseList exercises={[base, legPress]} hrefFor={(e) => `/exercises/${e.id}`} />);
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
    rerender(<ExerciseList exercises={[]} empty={{ title: "Nothing here" }} />);
    expect(screen.getByRole("heading", { name: "Nothing here" })).toBeInTheDocument();
  });
});

describe("ExerciseFilters", () => {
  it("renders tabs as links (active one marked), and a GET form that keeps the modality", () => {
    render(
      <ExerciseFilters
        basePath="/exercises"
        filters={{ ...DEFAULT_FILTERS, modality: "MACHINE", q: "press" }}
        tabs={[
          { modality: null, label: "All", count: 10, href: "/exercises", active: false },
          { modality: "MACHINE", label: "Machine", count: 4, href: "/exercises?modality=machine", active: true },
        ]}
        equipmentOptions={[{ equipment: "SMITH_MACHINE", count: 2 }]}
      />,
    );
    expect(screen.getByRole("link", { name: /Machine/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /All/ })).not.toHaveAttribute("aria-current");
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("method", "get");
    expect(form.querySelector('input[name="modality"]')).toHaveValue("machine");
    expect(form.querySelector('input[name="q"]')).toHaveValue("press");
    expect(screen.getByRole("option", { name: "Smith machine (2)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear" })).toHaveAttribute("href", "/exercises?modality=machine");
  });
});

describe("Pagination", () => {
  it("shows previous/next as links and hides itself for one page", () => {
    const { container, rerender } = render(<Pagination page={2} pageCount={3} hrefFor={(p) => `/x?page=${p}`} />);
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("href", "/x?page=1");
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/x?page=3");
    rerender(<Pagination page={1} pageCount={1} hrefFor={(p) => `/x?page=${p}`} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ExerciseDetail", () => {
  it("explains what the logged weight means and lists instructions", () => {
    render(<ExerciseDetail exercise={legPress} series={[]} />);
    expect(screen.getByText("Plates per side")).toBeInTheDocument();
    expect(screen.getByText(/never converted to free-weight numbers/)).toBeInTheDocument();
    expect(screen.getByText("Unrack the bar.")).toBeInTheDocument();
    expect(screen.getByText("You have not logged this exercise yet.")).toBeInTheDocument();
  });

  it("lists a series per machine profile, and omits the section when series is undefined", () => {
    const { rerender } = render(
      <ExerciseDetail
        exercise={legPress}
        series={[
          { seriesKey: `${legPress.id}:p1`, machineProfile: { id: "p1", name: "Hammer", gymName: "Downtown", brand: "Life Fitness" }, setCount: 1, lastLocalDate: "2026-10-12" },
          { seriesKey: legPress.id, machineProfile: null, setCount: 6, lastLocalDate: null },
        ]}
      />,
    );
    expect(screen.getByText("Hammer / Life Fitness / Downtown")).toBeInTheDocument();
    expect(screen.getByText("1 set / last 2026-10-12")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    rerender(<ExerciseDetail exercise={legPress} />);
    expect(screen.queryByRole("heading", { name: "Your progression" })).toBeNull();
  });

  it("shows the bodyweight share for bodyweight-plus exercises", () => {
    render(<ExerciseDetail exercise={{ ...base, modality: "BODYWEIGHT", equipment: "BODYWEIGHT", loadType: "BODYWEIGHT_PLUS", bodyweightFactor: 0.64 }} />);
    expect(screen.getByText(/about 64% of bodyweight/)).toBeInTheDocument();
  });
});
