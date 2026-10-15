import "fake-indexeddb/auto";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { activateUserDb, resetAllDbs } from "@/client/db/active";
import { repo } from "@/client/repo";
import { FavoriteButton } from "@/components/exercises/FavoriteButton";
import type { ExerciseRow } from "@/contracts/entities";
import { catalogExerciseId } from "@/lib/ids";
import { ExercisePicker } from "./ExercisePicker";

const catalogRow = (sourceId: string, over: Partial<ExerciseRow> = {}): ExerciseRow => ({
  id: catalogExerciseId(sourceId),
  isCustom: false,
  sourceId,
  slug: sourceId.toLowerCase().replaceAll("_", "-"),
  name: sourceId.replaceAll("_", " "),
  aliases: [],
  modality: "FREE_WEIGHT",
  equipment: "BARBELL",
  loadType: "TOTAL",
  tracking: "LOAD_REPS",
  bodyweightFactor: null,
  isUnilateral: false,
  mechanic: null,
  force: null,
  level: null,
  category: "STRENGTH",
  standardLift: null,
  instructions: [],
  images: [],
  muscles: [{ muscle: "CHEST", role: "PRIMARY" }],
  hlc: "",
  fieldHlc: {},
  version: 0,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const EXERCISES = [
  catalogRow("Barbell_Squat"),
  catalogRow("Incline_Dumbbell_Press", { equipment: "DUMBBELL" }),
  catalogRow("Incline_Dumbbell_Curl", { equipment: "DUMBBELL", muscles: [{ muscle: "BICEPS", role: "PRIMARY" }] }),
  catalogRow("Zottman_Curl", { equipment: "DUMBBELL", muscles: [{ muscle: "BICEPS", role: "PRIMARY" }] }),
  catalogRow("Cable_Fly", { modality: "CABLE", equipment: "CABLE" }),
];
const id = (sourceId: string) => catalogExerciseId(sourceId);

const original = { showModal: HTMLDialogElement.prototype.showModal, close: HTMLDialogElement.prototype.close };
beforeAll(() => {
  // jsdom has no <dialog> modal support; the picker only needs `open`.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterAll(() => {
  HTMLDialogElement.prototype.showModal = original.showModal;
  HTMLDialogElement.prototype.close = original.close;
});

beforeEach(async () => {
  activateUserDb("user-1");
  await repo.catalog.replace({ version: 1, generatedAt: "2026-10-14T00:00:00.000Z", exercises: EXERCISES });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await resetAllDbs();
});

const renderPicker = () => render(<ExercisePicker open onClose={() => undefined} unit="KG" onPick={() => undefined} />);
const section = (name: string) => screen.getByRole("region", { name });
/** Exercise names (the card headings), not the section heading. */
const namesIn = (region: HTMLElement) => [...region.querySelectorAll(".exercise-card__name")].map((h) => h.textContent);

describe("FavoriteButton", () => {
  it("is a pressed-state toggle with a name that says what it will do, backed by the local database", async () => {
    activateUserDb("user-1");
    const user = userEvent.setup();
    render(<FavoriteButton exerciseId={id("Barbell_Squat")} name="Barbell Squat" />);
    const button = await screen.findByRole("button", { name: "Add Barbell Squat to favorites" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await user.click(button);
    const on = await screen.findByRole("button", { name: "Remove Barbell Squat from favorites" });
    expect(on).toHaveAttribute("aria-pressed", "true");
    expect(await repo.favorites.isFavorite(id("Barbell_Squat"))).toBe(true);
    await user.click(on);
    expect(await screen.findByRole("button", { name: "Add Barbell Squat to favorites" })).toHaveAttribute("aria-pressed", "false");
    expect(await repo.favorites.isFavorite(id("Barbell_Squat"))).toBe(false);
  });

  it("starred right after sign-in, before the catalog reached the local database: it syncs, retries and the star lands", async () => {
    activateUserDb("user-fresh");
    const user = userEvent.setup();
    render(<FavoriteButton exerciseId={id("Barbell_Squat")} name="Barbell Squat" />);
    const button = await screen.findByRole("button", { name: "Add Barbell Squat to favorites" });
    await user.click(button); // NOT_FOUND: the exercise is not in this fresh database yet
    expect(await repo.favorites.isFavorite(id("Barbell_Squat"))).toBe(false);
    await repo.catalog.replace({ version: 1, generatedAt: "2026-10-14T00:00:00.000Z", exercises: EXERCISES }); // the first sync delivers it
    await waitFor(async () => expect(await repo.favorites.isFavorite(id("Barbell_Squat"))).toBe(true), { timeout: 4000 });
    expect(await screen.findByRole("button", { name: "Remove Barbell Squat from favorites" })).toHaveAttribute("aria-pressed", "true");
  });

  it("every star on the page shares one live query (a toggle re-reads once, not once per star)", async () => {
    const ids = vi.spyOn(repo.favorites, "ids");
    render(
      <>
        {EXERCISES.map((e) => (
          <FavoriteButton key={e.id} exerciseId={e.id} name={e.name} />
        ))}
      </>,
    );
    await screen.findByRole("button", { name: "Add Barbell Squat to favorites" });
    await waitFor(() => expect(ids).toHaveBeenCalledTimes(1));
    await repo.favorites.toggle(id("Barbell_Squat"));
    expect(await screen.findByRole("button", { name: "Remove Barbell Squat from favorites" })).toHaveAttribute("aria-pressed", "true");
    expect(ids).toHaveBeenCalledTimes(2);
  });

  it("paints the server-rendered state first (no active database yet)", () => {
    // no database activated here: `initial` is all the button knows
    render(<FavoriteButton exerciseId={id("Barbell_Squat")} name="Barbell Squat" initial />);
    expect(screen.getByRole("button", { name: "Remove Barbell Squat from favorites" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("ExercisePicker favorites", () => {
  it("shows a one-line hint when nothing is starred, then Favorites above Recent above All", async () => {
    const user = userEvent.setup();
    renderPicker();
    expect(await screen.findByText("Star an exercise to pin it here.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Favorites" })).toBeInTheDocument();

    // star two exercises from the list (position order = starring order)
    const all = section("Exercises");
    await user.click(await within(all).findByRole("button", { name: "Add Incline Dumbbell Press to favorites" }));
    expect(await screen.findByRole("region", { name: "Favorite exercises" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Star an exercise to pin it here.")).not.toBeInTheDocument());
    await user.click(await within(section("Exercises")).findByRole("button", { name: "Add Barbell Squat to favorites" }));
    await waitFor(() => expect(namesIn(section("Favorite exercises"))).toEqual(["Incline Dumbbell Press", "Barbell Squat"]));

    // every row, in every section, has the star (pressed where starred)
    const favSection = section("Favorite exercises");
    expect(await within(favSection).findByRole("button", { name: "Remove Barbell Squat from favorites" })).toHaveAttribute("aria-pressed", "true");
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings.indexOf("Favorites")).toBeLessThan(headings.indexOf("All"));

    // unstarring from the picker removes it from Favorites
    await user.click(await within(favSection).findByRole("button", { name: "Remove Incline Dumbbell Press from favorites" }));
    await waitFor(() => expect(namesIn(section("Favorite exercises"))).toEqual(["Barbell Squat"]));
  });

  it("keyword search finds 'incline db' and ranks a favorite above an equal match", async () => {
    const user = userEvent.setup();
    renderPicker();
    await screen.findByText("Star an exercise to pin it here.");
    await user.type(screen.getByRole("searchbox", { name: "Search exercises" }), "incline db");
    const results = await screen.findByRole("region", { name: "Exercises" });
    await waitFor(() => expect(namesIn(results)).toEqual(["Incline Dumbbell Curl", "Incline Dumbbell Press"]));
    expect(screen.queryByRole("heading", { name: "Favorites" })).not.toBeInTheDocument(); // sections are for the empty query

    await repo.favorites.toggle(id("Incline_Dumbbell_Press"));
    await waitFor(() => expect(namesIn(screen.getByRole("region", { name: "Exercises" }))).toEqual(["Incline Dumbbell Press", "Incline Dumbbell Curl"]));
  });

  it("Recent does not repeat what Favorites already shows", async () => {
    const workout = await repo.workouts.create({ startedAt: "2026-10-12T17:00:00.000Z", localDate: "2026-10-12", timezone: "UTC" });
    await repo.workoutExercises.create({ workoutId: workout.id, exerciseId: id("Barbell_Squat"), position: "a0" });
    await repo.workoutExercises.create({ workoutId: workout.id, exerciseId: id("Zottman_Curl"), position: "a1" });
    await repo.favorites.toggle(id("Barbell_Squat"));
    renderPicker();
    const recent = await screen.findByRole("region", { name: "Recent exercises" });
    expect(namesIn(recent)).toEqual(["Zottman Curl"]);
    expect(namesIn(section("Favorite exercises"))).toEqual(["Barbell Squat"]);
  });
});
