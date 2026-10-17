import "fake-indexeddb/auto";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { activateUserDb, resetAllDbs } from "@/client/db/active";
import { repo } from "@/client/repo";
import { FavoriteButton } from "@/components/exercises/FavoriteButton";
import type { ExerciseRow, WorkoutSetRow } from "@/contracts/entities";
import { addDays, toLocalDate } from "@/lib/dates";
import { catalogExerciseId } from "@/lib/ids";
import { toKg } from "@/lib/units";
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

describe("ExercisePicker last loads", () => {
  const today = () => toLocalDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  type LoggedSet = Partial<Pick<WorkoutSetRow, "setType" | "inputUnit" | "completedAt">> & { weightKg: number; reps: number };
  const log = async (exerciseId: string, localDate: string, sets: LoggedSet[], machineProfileId: string | null = null) => {
    const workout = await repo.workouts.create({ startedAt: `${localDate}T17:00:00.000Z`, localDate, timezone: "UTC" });
    const we = await repo.workoutExercises.create({ workoutId: workout.id, exerciseId, machineProfileId, position: "a0" });
    for (const [i, set] of sets.entries()) {
      await repo.sets.create({ workoutExerciseId: we.id, position: `a${i}`, setType: "WORKING", completedAt: `${localDate}T17:30:00.000Z`, ...set });
    }
  };
  const row = (region: HTMLElement, sourceId: string) => region.querySelector<HTMLElement>(`.exercise-card[data-exercise-id="${id(sourceId)}"]`)!;
  const lastLine = (card: HTMLElement) => card.querySelector(".exercise-card__meta--last")?.textContent ?? null;

  it("each row draws its last top set from the local database, in the unit it was entered in, machines included", async () => {
    await log(id("Barbell_Squat"), addDays(today(), -1), [
      { weightKg: 60, reps: 5, setType: "WARMUP" },
      { weightKg: 100, reps: 5 },
      { weightKg: 110, reps: 6 },
      { weightKg: 130, reps: 1, completedAt: null },
    ]);
    await log(id("Zottman_Curl"), "2026-01-05", [{ weightKg: toKg(25, "LB"), reps: 8, inputUnit: "LB" }]);
    const stack = await repo.machineProfiles.create({ name: "Cable tower", exerciseId: id("Cable_Fly"), pinStepKg: 5 });
    await log(id("Cable_Fly"), "2026-01-05", [{ weightKg: 35, reps: 12 }], stack.id);
    renderPicker();

    const all = await screen.findByRole("region", { name: "Exercises" });
    await waitFor(() => expect(lastLine(row(all, "Barbell_Squat"))).toBe("110 kg × 6 · yesterday"));
    const squat = row(all, "Barbell_Squat");
    expect(squat.querySelector(".eq-art")).not.toHaveClass("eq-art--ghost");
    expect(squat.querySelectorAll(".eq-plate").length).toBeGreaterThan(0);
    expect(squat).not.toHaveTextContent("Chest");

    expect(lastLine(row(all, "Zottman_Curl"))).toBe("25 lb × 8 · Mon 5 Jan");
    // logged on its machine: found under that machine's series, the pins counted with its 5 kg step (7 pins, 4 drawn plates up).
    // Cable Fly is not on the Free weight tab; Recent lists it.
    const cable = row(section("Recent exercises"), "Cable_Fly");
    expect(lastLine(cable)).toBe("35 kg × 12 · Mon 5 Jan");
    expect(cable.querySelectorAll(".eq-sp.is-on")).toHaveLength(4);

    // never done: the muscles and a faded drawing
    const curl = row(all, "Incline_Dumbbell_Curl");
    expect(lastLine(curl)).toBeNull();
    expect(curl).toHaveTextContent("Biceps");
    expect(curl.querySelector(".eq-art")).toHaveClass("eq-art--ghost");

    // Recent shows the same loads
    expect(lastLine(row(section("Recent exercises"), "Barbell_Squat"))).toBe("110 kg × 6 · yesterday");
  });

  it("looks up only the rows on screen, each once: a narrowing search reads nothing new, Show more only the new rows", async () => {
    const drills = Array.from({ length: 40 }, (_, i) => catalogRow(`Drill_${String(i).padStart(2, "0")}`));
    await repo.catalog.replace({ version: 2, generatedAt: "2026-10-14T00:00:00.000Z", exercises: [...EXERCISES, ...drills] });
    await log(id("Zottman_Curl"), "2026-01-05", [{ weightKg: 14, reps: 10 }]);
    const lastTime = vi.spyOn(repo.sets, "lastTime");
    const looked = () => lastTime.mock.calls.map(([q]) => q.exerciseId);
    const onScreen = () => new Set([...document.querySelectorAll<HTMLElement>(".exercise-card")].map((card) => card.dataset.exerciseId));
    const user = userEvent.setup();
    renderPicker();
    await waitFor(() => expect(lastLine(row(section("Recent exercises"), "Zottman_Curl"))).toBe("14 kg × 10 · Mon 5 Jan"));
    // the first page and Recent, not the 45 exercises in the catalog
    await waitFor(() => expect(new Set(looked())).toEqual(onScreen()));
    expect(onScreen().size).toBeLessThan(45);
    const firstPage = onScreen();

    lastTime.mockClear();
    await user.click(screen.getByRole("searchbox", { name: "Search exercises" }));
    await user.paste("zottman");
    await waitFor(() => expect(namesIn(section("Exercises"))).toEqual(["Zottman Curl"]));
    expect(lastLine(row(section("Exercises"), "Zottman_Curl"))).toBe("14 kg × 10 · Mon 5 Jan");
    expect(lastTime).not.toHaveBeenCalled();

    await user.clear(screen.getByRole("searchbox", { name: "Search exercises" }));
    await user.click(await screen.findByRole("button", { name: "Show more" }));
    await waitFor(() => expect(onScreen().size).toBeGreaterThan(firstPage.size));
    await waitFor(() => expect(looked().length).toBeGreaterThan(0));
    const added = [...onScreen()].filter((x) => !firstPage.has(x));
    await waitFor(() => expect(new Set(looked())).toEqual(new Set(added)));
  });
});
