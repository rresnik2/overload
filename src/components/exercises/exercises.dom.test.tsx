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
  it("draws the equipment instead of a photo, and names the muscles under the name", () => {
    const { container } = render(<ExerciseCard exercise={base} href="/exercises/abc" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".eq-art")).toHaveAttribute("data-kind", "bar");
    expect(container.querySelector(".eq-art")).toHaveClass("eq-art--ghost");
    expect(screen.getByText("Quadriceps · Glutes")).toBeInTheDocument();
  });

  it("with a last load, loads the drawing and says the set and the day instead of the muscles", () => {
    const lastLoad = { exerciseId: base.id, localDate: "2026-10-12" as never, weightKg: 110, reps: 6, pinStepKg: null, inputUnit: null };
    const { container } = render(<ExerciseCard exercise={base} href="/exercises/abc" lastLoad={lastLoad} unit="KG" today={"2026-10-16" as never} />);
    expect(screen.getByText("110 kg × 6 · Mon 12 Oct")).toBeInTheDocument();
    expect(screen.queryByText("Quadriceps · Glutes")).toBeNull();
    const art = container.querySelector(".eq-art")!;
    expect(art).not.toHaveClass("eq-art--ghost");
    // 110 kg on a 20 kg bar: 25 + 20 a side, drawn on both sleeves
    expect([...art.querySelectorAll(".eq-side--r .eq-plate")].map((p) => p.getAttribute("data-weight"))).toEqual(["25", "20"]);
    expect(art.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("passes each exercise its last load from the list's map", () => {
    const loads = new Map([[base.id, { exerciseId: base.id, localDate: "2026-10-12" as never, weightKg: 100, reps: 5, pinStepKg: null, inputUnit: null }]]);
    render(<ExerciseList exercises={[base]} lastLoads={loads} unit="KG" label="Yours" />);
    expect(screen.getByRole("list", { name: "Yours" })).toHaveTextContent("100 kg × 5");
  });

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

  it("favoriteIds and renderAction stay props-only: the card tells the action whether the exercise is starred", () => {
    const seen: [string, boolean][] = [];
    render(
      <ExerciseList
        exercises={[base, legPress]}
        hrefFor={(e) => `/exercises/${e.id}`}
        favoriteIds={new Set([legPress.id])}
        renderAction={(e, isFavorite) => {
          seen.push([e.name, isFavorite]);
          return <button type="button" aria-pressed={isFavorite}>{`Star ${e.name}`}</button>;
        }}
      />,
    );
    expect(seen).toEqual([["Barbell Squat", false], ["Leg Press", true]]);
    const article = screen.getByRole("heading", { name: "Leg Press" }).closest("article") as HTMLElement;
    expect(article).toHaveClass("exercise-card--starrable");
    const star = within(article).getByRole("button", { name: "Star Leg Press" });
    expect(star).toHaveAttribute("aria-pressed", "true");
    // the control is a sibling of the card link, never inside it (a button inside a link is invalid)
    expect(star.closest("a")).toBeNull();
    expect(within(article).getByRole("link")).toHaveAttribute("href", `/exercises/${legPress.id}`);
  });

  it("without renderAction there is no star slot", () => {
    render(<ExerciseCard exercise={base} href="/exercises/x" />);
    expect(document.querySelector(".exercise-card__star")).toBeNull();
    expect(document.querySelector(".exercise-card--starrable")).toBeNull();
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
    expect((form as HTMLFormElement).method).toBe("get"); // next/form renders no method attribute: a GET form, also without JavaScript
    expect(form).toHaveAttribute("action", "/exercises");
    expect(form.querySelector('input[name="modality"]')).toHaveValue("machine");
    expect(form.querySelector('input[name="q"]')).toHaveValue("press");
    expect(screen.getByRole("option", { name: "Smith machine (2)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear" })).toHaveAttribute("href", "/exercises?modality=machine");
  });
});

describe("ExerciseFilters favorites chip", () => {
  const tabs = [{ modality: null, label: "All", count: 10, href: "/exercises", active: true }];

  it("is a server-rendered link that turns the filter on (fav=1) and off, and the form keeps fav", () => {
    const { rerender } = render(<ExerciseFilters basePath="/exercises" filters={{ ...DEFAULT_FILTERS, q: "curl" }} tabs={tabs} equipmentOptions={[]} />);
    const off = screen.getByRole("link", { name: "Favorites" });
    expect(off).toHaveAttribute("href", "/exercises?q=curl&fav=1");
    expect(off).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("search").querySelector('input[name="fav"]')).toBeNull();

    rerender(<ExerciseFilters basePath="/exercises" filters={{ ...DEFAULT_FILTERS, q: "curl", fav: true }} tabs={tabs} equipmentOptions={[]} />);
    const on = screen.getByRole("link", { name: "Favorites" });
    expect(on).toHaveAttribute("aria-current", "true");
    expect(on).toHaveAttribute("href", "/exercises?q=curl");
    expect(screen.getByRole("search").querySelector('input[name="fav"]')).toHaveValue("1");
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
