import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, libraryHref, parseLibraryParams, toSlug } from "./library-url";

describe("parseLibraryParams", () => {
  it("reads slugs case-insensitively and ignores unknown values", () => {
    expect(parseLibraryParams({ modality: "free-weight", equipment: "EZ-BAR", muscle: "lower-back", q: "  bent   over ", page: "3" })).toEqual({
      modality: "FREE_WEIGHT",
      equipment: "EZ_BAR",
      muscle: "LOWER_BACK",
      q: "bent over",
      fav: false,
      page: 3,
    });
    expect(parseLibraryParams({ modality: "spaceship", equipment: ["nope"], muscle: "", page: "-4" })).toEqual(DEFAULT_FILTERS);
  });

  it("takes the first of repeated params and caps the query length", () => {
    expect(parseLibraryParams({ modality: ["cable", "machine"] }).modality).toBe("CABLE");
    expect(parseLibraryParams({ q: "x".repeat(500) }).q).toHaveLength(80);
  });
});

describe("libraryHref", () => {
  it("omits defaults and round-trips through parseLibraryParams", () => {
    expect(libraryHref("/exercises", DEFAULT_FILTERS)).toBe("/exercises");
    const filters = { modality: "MACHINE", equipment: "SMITH_MACHINE", muscle: "QUADRICEPS", q: "squat", fav: true, page: 2 } as const;
    const href = libraryHref("/exercises", filters, { page: 2 });
    expect(href).toBe("/exercises?modality=machine&equipment=smith-machine&muscle=quadriceps&q=squat&fav=1&page=2");
    expect(parseLibraryParams(Object.fromEntries(new URL(href, "http://x").searchParams))).toEqual(filters);
  });

  it("resets the page on any filter change, and the equipment when the modality changes", () => {
    const filters = { ...DEFAULT_FILTERS, modality: "FREE_WEIGHT", equipment: "BARBELL", page: 4 } as const;
    expect(libraryHref("/exercises", filters, { q: "row" })).toBe("/exercises?modality=free-weight&equipment=barbell&q=row");
    expect(libraryHref("/exercises", filters, { modality: "MACHINE" })).toBe("/exercises?modality=machine");
    expect(libraryHref("/exercises", filters, { modality: null, equipment: null })).toBe("/exercises");
  });

  it("fav=1 is the favorites filter: only the literal 1 turns it on, it round-trips, and toggling it resets the page", () => {
    expect(parseLibraryParams({ fav: "1" }).fav).toBe(true);
    expect(parseLibraryParams({ fav: ["1", "0"] }).fav).toBe(true);
    for (const value of ["0", "true", "", "yes", undefined]) expect(parseLibraryParams({ fav: value }).fav, String(value)).toBe(false);
    expect(libraryHref("/exercises", DEFAULT_FILTERS, { fav: true })).toBe("/exercises?fav=1");
    expect(libraryHref("/exercises", { ...DEFAULT_FILTERS, fav: true, page: 3 }, { fav: false })).toBe("/exercises");
    expect(libraryHref("/exercises", { ...DEFAULT_FILTERS, fav: true, modality: "CABLE", page: 3 }, { modality: "MACHINE" })).toBe("/exercises?modality=machine&fav=1");
  });

  it("slugs enum values", () => {
    expect(toSlug("MACHINE_PLATE_LOADED")).toBe("machine-plate-loaded");
  });
});
