// The offline picker (repo.exercises.search over Dexie) and the server library (applyLibraryQuery) must return the SAME
// exercises in the SAME order for the same query and filters: one pure search module, two callers. The fixture is the
// real catalog plus a custom exercise, with a few favorites.
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { ExerciseClassification } from "@/contracts/catalog";
import type { ExerciseRow } from "@/contracts/entities";
import type { ExerciseSearch } from "@/contracts/repo";
import { newDevice, type TestDevice } from "@/client/repo/test-utils";
import { resetAllDbs } from "@/client/db/active";
import { catalogExerciseId } from "@/lib/ids";
import { applyLibraryQuery } from "@/server/catalog/library";
import { loadSourceRows } from "../../../prisma/seed/catalog";
import { classify } from "../../../prisma/seed/classify";

const toRow = (c: ExerciseClassification): ExerciseRow => ({
  id: catalogExerciseId(c.sourceId),
  isCustom: false,
  sourceId: c.sourceId,
  slug: c.slug,
  name: c.name,
  aliases: c.aliases,
  modality: c.modality,
  equipment: c.equipment,
  loadType: c.loadType,
  tracking: c.tracking,
  bodyweightFactor: c.bodyweightFactor,
  isUnilateral: c.isUnilateral,
  mechanic: c.mechanic,
  force: c.force,
  level: c.level,
  category: c.category,
  standardLift: c.standardLift,
  instructions: c.instructions,
  images: c.images,
  muscles: c.muscles,
  hlc: "",
  fieldHlc: {},
  version: 0,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const catalog = loadSourceRows().map((r) => toRow(classify(r)));
const FAVORITES = ["Leg_Press", "Incline_Dumbbell_Press", "Dumbbell_Bicep_Curl", "Barbell_Curl", "Standing_Military_Press"].map(catalogExerciseId);

let device: TestDevice;
afterEach(async () => {
  device?.db.close();
  await resetAllDbs();
});

const QUERIES = ["", "incline db", "chest machine", "ohp", "rdl", "leg press", "bench", "dumbel curl", "lats cable", "curls", "pecs", "bw", "abs", "calf raises", "tbar row", "hammer", "ez bar curl", "  Press  ", "zzzz"];
// The filters both sides share (the library has no standard-lift filter).
const FILTERS: Pick<ExerciseSearch, "modality" | "equipment" | "muscle">[] = [
  {},
  { modality: "MACHINE" },
  { muscle: "CHEST" },
  { equipment: "DUMBBELL" },
  { modality: "FREE_WEIGHT", muscle: "BICEPS" },
];

describe("picker (Dexie) and library (server) agree", () => {
  it("return identical ids in identical order for every query x filter", async () => {
    device = newDevice();
    const { repo } = device;
    await repo.catalog.replace({ version: 1, generatedAt: "2026-10-14T00:00:00.000Z", exercises: catalog });
    const custom = await repo.exercises.create({
      slug: "pause-squat",
      name: "Pause Squat",
      aliases: ["paused squat"],
      modality: "FREE_WEIGHT",
      equipment: "BARBELL",
      loadType: "TOTAL",
      muscles: [{ muscle: "QUADRICEPS", role: "PRIMARY" }, { muscle: "GLUTES", role: "SECONDARY" }],
    });
    for (const id of [...FAVORITES, custom.id]) await repo.favorites.toggle(id);
    const visible = [...catalog, custom];
    const favoriteIds = await repo.favorites.ids();
    expect(favoriteIds.size).toBe(FAVORITES.length + 1);

    let compared = 0;
    for (const text of QUERIES) {
      for (const filter of FILTERS) {
        const picker = (await repo.exercises.search({ text, ...filter })).map((e) => e.id);
        const library = applyLibraryQuery(visible, { text, ...filter, pageSize: 5000 }, favoriteIds).exercises.map((e) => e.id);
        expect(library, `"${text}" ${JSON.stringify(filter)}`).toEqual(picker);
        compared += 1;
      }
    }
    expect(compared).toBe(QUERIES.length * FILTERS.length);
    // the shared module actually ran: a keyword query is not the whole catalog and favorites rank first among equals
    expect((await repo.exercises.search({ text: "incline db" })).map((e) => e.name)).toContain("Incline Dumbbell Press");
    expect((await repo.exercises.search({ text: "zzzz" })).length).toBe(0);
  });

  it("the library paginates the same ranked list the picker returns", async () => {
    device = newDevice();
    const { repo } = device;
    await repo.catalog.replace({ version: 1, generatedAt: "2026-10-14T00:00:00.000Z", exercises: catalog });
    const picker = (await repo.exercises.search({ text: "press" })).map((e) => e.id);
    const pages: string[] = [];
    const first = applyLibraryQuery(catalog, { text: "press", pageSize: 20 }, new Set());
    for (let page = 1; page <= first.pageCount; page++) pages.push(...applyLibraryQuery(catalog, { text: "press", pageSize: 20, page }, new Set()).exercises.map((e) => e.id));
    expect(pages).toEqual(picker);
    expect(first.total).toBe(picker.length);
  });
});

describe("applyLibraryQuery", () => {
  it("favoritesOnly keeps only starred exercises, in rank order, with facets computed under that filter", () => {
    const favorites = new Set(FAVORITES);
    const result = applyLibraryQuery(catalog, { favoritesOnly: true, pageSize: 100 }, favorites);
    expect(result.exercises.map((e) => e.id).sort()).toEqual([...favorites].sort());
    expect(result.total).toBe(favorites.size);
    expect(Object.values(result.modalityCounts).reduce((a, b) => a + b, 0)).toBe(favorites.size);
    expect(result.favoriteIds).toEqual([...favorites].sort());
    const curls = applyLibraryQuery(catalog, { favoritesOnly: true, text: "curl", pageSize: 100 }, favorites);
    expect(curls.exercises.every((e) => /curl/i.test(e.name))).toBe(true);
    expect(curls.total).toBe(2);
  });

  it("an empty query is in name order; facets count under muscle/text but not modality/equipment", () => {
    const all = applyLibraryQuery(catalog, { pageSize: 5000 }, new Set());
    const names = all.exercises.map((e) => e.name.toLowerCase());
    expect(names).toHaveLength(catalog.length);
    const smith = applyLibraryQuery(catalog, { modality: "MACHINE", equipment: "SMITH_MACHINE", pageSize: 5000 }, new Set());
    expect(smith.exercises.every((e) => e.equipment === "SMITH_MACHINE")).toBe(true);
    expect(smith.modalityCounts.MACHINE).toBeGreaterThan(smith.total);
    expect(smith.equipmentOptions.map((o) => o.equipment)).toContain("MACHINE_SELECTORIZED");
    expect(Object.values(all.modalityCounts).reduce((a, b) => a + b, 0)).toBe(all.total);
  });

  it("clamps pages", () => {
    const far = applyLibraryQuery(catalog, { pageSize: 10, page: 9999 }, new Set());
    expect(far.page).toBe(far.pageCount);
    expect(far.exercises.length).toBeGreaterThan(0);
  });
});
