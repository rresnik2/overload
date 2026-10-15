import fc from "fast-check";
import type { Equipment, LoadType } from "@/contracts/enums";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BAR_WEIGHT,
  dialValues,
  dumbbellScale,
  fitPlates,
  heaviestTone,
  KETTLEBELL_SIZES,
  kettlebellScale,
  kettlebellStyle,
  loadableTotals,
  loadBar,
  loadNote,
  loadSide,
  PLATES,
  pinFor,
  plateSet,
  type Plate,
} from "./plates";

const weights = (l: { perSide: Plate[] }) => l.perSide.map((p) => p.weight);
const KG = PLATES.KG;
const LB = PLATES.LB;
const noQuarter = plateSet("KG", [25, 20, 15, 10, 5, 2.5]); // no 1.25 kg plates

describe("PLATES", () => {
  it("are heaviest first with the real colours", () => {
    expect(KG.map((p) => p.weight)).toEqual([25, 20, 15, 10, 5, 2.5, 1.25]);
    expect(KG.map((p) => p.tone)).toEqual(["red", "blue", "yellow", "green", "white", "black", "chrome"]);
    expect(LB.map((p) => p.weight)).toEqual([55, 45, 35, 25, 10, 5, 2.5]);
    expect(LB.map((p) => p.tone)).toEqual(KG.map((p) => p.tone));
    expect(KG.map((p) => [p.height, p.width])).toEqual([[86, 13], [86, 11], [74, 10], [60, 9], [44, 7], [36, 6], [30, 5]]);
  });
  it("default bar weights", () => {
    expect(DEFAULT_BAR_WEIGHT.BARBELL).toEqual({ KG: 20, LB: 45 });
    expect(DEFAULT_BAR_WEIGHT.EZ_BAR).toEqual({ KG: 10, LB: 25 });
    expect(DEFAULT_BAR_WEIGHT.TRAP_BAR).toEqual({ KG: 25, LB: 55 });
  });
});

describe("plateSet", () => {
  it("returns the standard set for null or empty", () => {
    expect(plateSet("KG", null)).toBe(PLATES.KG);
    expect(plateSet("LB", [])).toBe(PLATES.LB);
  });
  it("keeps a kg inventory in kg, heaviest first, deduplicated", () => {
    expect(plateSet("KG", [1.25, 25, 5, 25]).map((p) => p.weight)).toEqual([25, 5, 1.25]);
  });
  it("draws unknown weights as chrome 4 x 26", () => {
    const half = plateSet("KG", [25, 0.5]).find((p) => p.weight === 0.5);
    expect(half).toEqual({ weight: 0.5, tone: "chrome", height: 26, width: 4 });
  });
  it("reads a 20.41 kg plate as 45 lb, blue", () => {
    expect(plateSet("LB", [20.41])[0]).toEqual(LB[1]);
    expect(plateSet("LB", [25.4, 11.34, 4.54, 2.27, 1.13]).map((p) => p.weight)).toEqual([55, 25, 10, 5, 2.5]);
  });
  it("keeps the colour of a kg plate in an lb gym, labelled to the half pound", () => {
    const p = plateSet("LB", [20])[0] as Plate;
    expect(p.weight).toBe(44);
    expect(p.tone).toBe("blue");
  });
  it("ignores junk weights and falls back to the standard set", () => {
    expect(plateSet("KG", [0, -5, Number.NaN])).toBe(PLATES.KG);
  });
});

describe("loadBar", () => {
  it("102.5 kg on a 20 kg bar is 25 + 15 + 1.25 per side", () => {
    const l = loadBar(102.5, 20, KG);
    expect(weights(l)).toEqual([25, 15, 1.25]);
    expect(l).toMatchObject({ loaded: 102.5, exact: true });
  });
  it("20 kg is an empty bar", () => {
    expect(loadBar(20, 20, KG)).toEqual({ perSide: [], loaded: 20, exact: true });
  });
  it("101 kg is inexact: 100 kg loaded", () => {
    const l = loadBar(101, 20, KG);
    expect(l.exact).toBe(false);
    expect(l.loaded).toBe(100);
    expect(weights(l)).toEqual([25, 15]);
  });
  it("lb 225 on a 45 lb bar is 45 + 45", () => {
    const l = loadBar(225, 45, LB);
    expect(weights(l)).toEqual([45, 45]);
    expect(l).toMatchObject({ loaded: 225, exact: true });
  });
  it("a lb side prefers 45s to a 55 unless the 55 saves a plate", () => {
    expect(weights(loadBar(315, 45, LB))).toEqual([45, 45, 45]); // 135 per side
    expect(weights(loadBar(265, 45, LB))).toEqual([55, 55]); // 110: 55 + 55 is two plates, 45 + 45 + 10 + 10 is four
    expect(weights(loadBar(245, 45, LB))).toEqual([55, 45]); // 100: 55 + 45 is two plates, 45 + 45 + 10 is three
  });
  it("lb 135 is one 45 per side; lb 140 adds a 2.5", () => {
    expect(weights(loadBar(135, 45, LB))).toEqual([45]);
    expect(weights(loadBar(140, 45, LB))).toEqual([45, 2.5]);
    expect(loadBar(140, 45, LB).loaded).toBe(140);
  });
  it("a 15 kg bar profile", () => {
    const l = loadBar(100, 15, KG);
    expect(l).toMatchObject({ loaded: 100, exact: true });
    expect(weights(l)).toEqual([25, 15, 2.5]);
    expect(loadBar(15, 15, KG)).toMatchObject({ perSide: [], exact: true });
  });
  it("below the bar is an empty loadout", () => {
    const l = loadBar(12.5, 20, KG);
    expect(l.perSide).toEqual([]);
    expect(l.exact).toBe(false);
    expect(l.loaded).toBe(20);
  });
  it("an inventory without 1.25 kg rounds 102.5 down to 100", () => {
    const l = loadBar(102.5, 20, noQuarter);
    expect(l).toMatchObject({ loaded: 100, exact: false });
  });
  it("finds combinations greedy would miss", () => {
    const odd = plateSet("KG", [20, 15]);
    const l = loadBar(80, 20, odd); // 30 per side = 15 + 15
    expect(weights(l)).toEqual([15, 15]);
    expect(l.exact).toBe(true);
  });
  it("0.5 kg fractionals", () => {
    const withHalf = plateSet("KG", [25, 20, 15, 10, 5, 2.5, 1.25, 0.5]);
    const l = loadBar(21, 20, withHalf);
    expect(weights(l)).toEqual([0.5]);
    expect(l).toMatchObject({ loaded: 21, exact: true });
    expect(loadBar(102, 20, withHalf)).toMatchObject({ loaded: 102, exact: true }); // 41 = 25 + 15 + 0.5 + 0.5
    expect(loadBar(20.5, 20, withHalf)).toMatchObject({ loaded: 20, exact: false });
  });
  it("handles a huge total without hanging", () => {
    const l = loadBar(5_000_000, 20, KG);
    expect(l.loaded).toBeLessThanOrEqual(5_000_000);
    expect(l.perSide.length).toBeGreaterThan(0);
  });
});

describe("loadSide", () => {
  it("loads one horn", () => {
    expect(weights(loadSide(40, KG))).toEqual([25, 15]);
    expect(loadSide(40, KG)).toMatchObject({ loaded: 40, exact: true });
    expect(loadSide(0, KG)).toEqual({ perSide: [], loaded: 0, exact: true });
    expect(loadSide(41, KG)).toMatchObject({ loaded: 40, exact: false });
  });
});

describe("loadableTotals", () => {
  it("standard kg plates make every 2.5 kg from the bar", () => {
    const t = loadableTotals(20, KG, 400);
    expect(t[0]).toBe(20);
    expect(t[1]).toBe(22.5);
    expect(t.at(-1)).toBe(400);
    expect(t).toHaveLength(153);
  });
  it("an inventory without 1.25 kg steps by 5 kg", () => {
    const t = loadableTotals(20, noQuarter, 60);
    expect(t).toEqual([20, 25, 30, 35, 40, 45, 50, 55, 60]);
  });
  it("lb steps by 5", () => {
    const t = loadableTotals(45, LB, 65);
    expect(t).toEqual([45, 50, 55, 60, 65]);
  });
  it("a 15 kg bar starts at 15", () => {
    expect(loadableTotals(15, KG, 25)).toEqual([15, 17.5, 20, 22.5, 25]);
  });
  it("0.5 kg fractionals add 1 kg steps", () => {
    const withHalf = plateSet("KG", [25, 20, 15, 10, 5, 2.5, 0.5]);
    expect(loadableTotals(20, withHalf, 24)).toEqual([20, 21, 22, 23, 24]);
  });
  it("has no values when max is below the bar", () => {
    expect(loadableTotals(20, KG, 10)).toEqual([]);
  });
  it("is fast for 400 kg with fractionals", () => {
    const fractional = plateSet("KG", [25, 20, 15, 10, 5, 2.5, 1.25, 0.5, 0.25]);
    const t0 = performance.now();
    const t = loadableTotals(20, fractional, 400);
    expect(performance.now() - t0).toBeLessThan(250);
    expect(t.at(-1)).toBe(400);
  });
});

describe("kettlebells", () => {
  it("lists the kg and lb sizes", () => {
    expect(KETTLEBELL_SIZES.KG).toEqual([4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48]);
    expect(KETTLEBELL_SIZES.LB).toEqual([9, 13, 18, 22, 26, 31, 35, 44, 53, 62, 70, 80, 88, 97, 106]);
  });
  it("uses the list for the dial and inserts an 18 kg bell in order", () => {
    const base = { equipment: "KETTLEBELL", loadType: "PER_IMPLEMENT", unit: "KG", step: 4, bar: null } as const;
    expect(dialValues({ ...base, current: null })).toEqual([...KETTLEBELL_SIZES.KG]);
    expect(dialValues({ ...base, current: 24 })).toEqual([...KETTLEBELL_SIZES.KG]);
    const v = dialValues({ ...base, current: 18 });
    expect(v).toHaveLength(16);
    expect(v.slice(6, 10)).toEqual([16, 18, 20, 24]);
  });
  it("lb bells keep the colour of their kg size; off-list sizes take the next size down", () => {
    expect(kettlebellStyle(53, "LB")).toEqual(kettlebellStyle(24, "KG"));
    expect(kettlebellStyle(24, "KG").fill).toBe("#2F9A4F");
    expect(kettlebellStyle(18, "KG")).toEqual(kettlebellStyle(16, "KG"));
    expect(kettlebellStyle(2, "KG")).toEqual(kettlebellStyle(4, "KG"));
  });
  it("ink is dark on 4, 6, 10, 16, 40, 44, 48 and white elsewhere", () => {
    const dark = KETTLEBELL_SIZES.KG.filter((w) => kettlebellStyle(w, "KG").ink === "#16181A");
    expect(dark).toEqual([4, 6, 10, 16, 40, 44, 48]);
    expect(kettlebellStyle(106, "LB").ink).toBe("#16181A");
  });
  it("scales", () => {
    expect(kettlebellScale(4, "KG")).toBeCloseTo(0.42);
    expect(kettlebellScale(48, "KG")).toBeCloseTo(1);
    expect(kettlebellScale(106, "LB")).toBeCloseTo(1, 1);
    expect(dumbbellScale(2, "KG")).toBeCloseTo(26 / 92);
    expect(dumbbellScale(1, "KG")).toBeCloseTo(26 / 92);
    expect(dumbbellScale(0, "KG")).toBeGreaterThanOrEqual(0.28);
    expect(dumbbellScale(60, "KG")).toBe(1);
    expect(dumbbellScale(32, "KG")).toBeCloseTo((26 + 66 * Math.sqrt(30 / 58)) / 92);
    expect(dumbbellScale(70.5, "LB")).toBeCloseTo(dumbbellScale(32, "KG"), 2);
  });
});

describe("pinFor", () => {
  it("with a base, pin 1 is the base", () => {
    expect(pinFor(45, 5, 5)).toBe(9);
    expect(pinFor(5, 5, 5)).toBe(1);
    expect(pinFor(30, 2.5, 20)).toBe(5);
  });
  it("without a base it is value / step", () => {
    expect(pinFor(45, 5, null)).toBe(9);
    expect(pinFor(47, 5, null)).toBe(9);
    expect(pinFor(0, 5, null)).toBe(0);
  });
  it("guards a bad step", () => {
    expect(pinFor(45, 0, null)).toBe(0);
  });
});

describe("dialValues", () => {
  const bar = { equipment: "BARBELL", loadType: "TOTAL", unit: "KG", step: 2.5, current: null, bar: null } as const;

  it("barbell: loadable totals from the default bar to 400", () => {
    const v = dialValues(bar);
    expect(v[0]).toBe(20);
    expect(v.at(-1)).toBe(400);
    expect(v[1]).toBe(22.5);
  });
  it("barbell lb: from 45 to 900", () => {
    const v = dialValues({ ...bar, unit: "LB", step: 5 });
    expect(v[0]).toBe(45);
    expect(v.at(-1)).toBe(900);
  });
  it("uses a bar profile weight and plate inventory", () => {
    const v = dialValues({ ...bar, bar: 15, plates: noQuarter });
    expect(v.slice(0, 4)).toEqual([15, 20, 25, 30]);
  });
  it("EZ bar and trap bar default weights; smith without a bar is plates only", () => {
    expect(dialValues({ ...bar, equipment: "EZ_BAR" })[0]).toBe(10);
    expect(dialValues({ ...bar, equipment: "TRAP_BAR" })[0]).toBe(25);
    expect(dialValues({ ...bar, equipment: "SMITH_MACHINE" }).slice(0, 3)).toEqual([0, 2.5, 5]);
    expect(dialValues({ ...bar, equipment: "SMITH_MACHINE", bar: 15 })[0]).toBe(15);
  });
  it("inserts an off-step current value in order (101 kg)", () => {
    const v = dialValues({ ...bar, current: 101 });
    expect(v).toContain(101);
    expect(v[v.indexOf(101) - 1]).toBe(100);
    expect(v[v.indexOf(101) + 1]).toBe(102.5);
  });
  it("inserts a value below the bar and above the range", () => {
    expect(dialValues({ ...bar, current: 12.5 }).slice(0, 2)).toEqual([12.5, 20]);
    expect(dialValues({ ...bar, current: 412.5 }).at(-1)).toBe(412.5);
  });
  it("does not duplicate an on-step value", () => {
    const v = dialValues({ ...bar, current: 100 });
    expect(v.filter((x) => x === 100)).toHaveLength(1);
  });
  it("dumbbells: uniform from the step to 80 kg", () => {
    const v = dialValues({ equipment: "DUMBBELL", loadType: "PER_IMPLEMENT", unit: "KG", step: 2, current: 31, bar: null });
    expect(v.slice(0, 3)).toEqual([2, 4, 6]);
    expect(v).toContain(31);
    expect(v.at(-1)).toBe(80);
    const lb = dialValues({ equipment: "DUMBBELL", loadType: "PER_IMPLEMENT", unit: "LB", step: 5, current: null, bar: null });
    expect(lb.slice(0, 3)).toEqual([5, 10, 15]);
    expect(lb.at(-1)).toBe(180);
  });
  it("plate-loaded machines count plates per side from 0", () => {
    const v = dialValues({ equipment: "MACHINE_PLATE_LOADED", loadType: "PLATES_PER_SIDE", unit: "KG", step: 5, current: null, bar: 30 });
    expect(v.slice(0, 3)).toEqual([0, 5, 10]);
    expect(v.at(-1)).toBe(250);
  });
  it("stacks: pin 1 is the base load, else the step", () => {
    const stack = { equipment: "MACHINE_SELECTORIZED", loadType: "STACK", unit: "KG", step: 5, current: null } as const;
    expect(dialValues({ ...stack, bar: null }).slice(0, 3)).toEqual([5, 10, 15]);
    expect(dialValues({ ...stack, bar: 7.5 }).slice(0, 3)).toEqual([7.5, 12.5, 17.5]);
    expect(dialValues({ ...stack, equipment: "CABLE", step: 2.5, bar: null }).slice(0, 3)).toEqual([2.5, 5, 7.5]);
  });
  it("everything else is uniform from the step", () => {
    const v = dialValues({ equipment: "BODYWEIGHT", loadType: "BODYWEIGHT_PLUS", unit: "KG", step: 1, current: 0, bar: null });
    expect(v.slice(0, 3)).toEqual([0, 1, 2]);
    expect(v.at(-1)).toBe(200);
  });
  it("copes with a bad step and float steps", () => {
    const v = dialValues({ equipment: "OTHER", loadType: "TOTAL", unit: "KG", step: 0.1, current: null, bar: null });
    expect(v.slice(0, 4)).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(dialValues({ equipment: "OTHER", loadType: "TOTAL", unit: "KG", step: 0, current: null, bar: null }).length).toBeGreaterThan(10);
  });
});

describe("helpers", () => {
  it("heaviestTone", () => {
    expect(heaviestTone(loadBar(102.5, 20, KG).perSide)).toBe("red");
    expect(heaviestTone([])).toBeNull();
  });
  it("loadNote", () => {
    expect(loadNote(null, 20, loadBar(0, 20, KG))).toBeNull();
    expect(loadNote(20, 20, loadBar(20, 20, KG))).toEqual({ kind: "empty", bar: 20 });
    expect(loadNote(15, 20, loadBar(15, 20, KG))).toEqual({ kind: "below-bar", bar: 20, requested: 15 });
    expect(loadNote(101, 20, loadBar(101, 20, KG))).toEqual({ kind: "inexact", requested: 101, nearest: 100 });
    expect(loadNote(102.5, 20, loadBar(102.5, 20, KG))).toBeNull();
  });
  it("fitPlates leaves a normal side alone and squeezes then hides a loaded one", () => {
    expect(fitPlates(loadBar(102.5, 20, KG).perSide)).toMatchObject({ widthScale: 1, hidden: 0 });
    const heavy = loadBar(700, 20, KG).perSide; // 13 x 25 kg + 15 per side
    const fit = fitPlates(heavy);
    expect(fit.widthScale).toBeGreaterThanOrEqual(0.6);
    expect(fit.plates.length + fit.hidden).toBe(heavy.length);
    expect(fit.hidden).toBeGreaterThan(0);
    const sum = fit.plates.reduce((s, p) => s + p.width * fit.widthScale, 0) + 1.5 * (fit.plates.length - 1);
    expect(sum).toBeLessThanOrEqual(85 + 1e-9);
    expect(fitPlates([])).toEqual({ plates: [], widthScale: 1, hidden: 0 });
  });
});

describe("properties", () => {
  const plateSets = fc.constantFrom(
    { unit: "KG" as const, bar: 20, plates: KG },
    { unit: "KG" as const, bar: 15, plates: KG },
    { unit: "KG" as const, bar: 20, plates: noQuarter },
    { unit: "KG" as const, bar: 10, plates: plateSet("KG", [25, 20, 15, 10, 5, 2.5, 1.25, 0.5]) },
    { unit: "LB" as const, bar: 45, plates: LB },
    { unit: "KG" as const, bar: 0, plates: plateSet("KG", [20, 15]) },
  );
  const totalArb = fc.integer({ min: 0, max: 8000 }).map((n) => n / 20); // 0 .. 400 in 0.05 steps

  it("a loadout never exceeds the target", () => {
    fc.assert(
      fc.property(plateSets, totalArb, ({ bar, plates }, total) => {
        fc.pre(total >= bar);
        const l = loadBar(total, bar, plates);
        expect(l.loaded).toBeLessThanOrEqual(total + 1e-9);
        expect(l.loaded).toBeGreaterThanOrEqual(bar);
        const made = bar + 2 * l.perSide.reduce((s, p) => s + p.weight, 0);
        expect(made).toBeCloseTo(l.loaded, 6);
        expect(l.exact).toBe(Math.abs(l.loaded - total) < 1e-9);
      }),
      { numRuns: 300 },
    );
  });

  it("is exact whenever the target is in loadableTotals, and inexact loads the nearest total below", () => {
    fc.assert(
      fc.property(plateSets, (set) => {
        const totals = loadableTotals(set.bar, set.plates, 400);
        const lookup = new Set(totals);
        for (const t of totals.filter((_, i) => i % 7 === 0)) {
          const l = loadBar(t, set.bar, set.plates);
          expect(l.exact).toBe(true);
          expect(l.loaded).toBe(t);
        }
        const probe = fc.sample(totalArb, 40);
        for (const t of probe) {
          if (t < set.bar) continue;
          const l = loadBar(t, set.bar, set.plates);
          expect(lookup.has(Math.round(l.loaded * 1000) / 1000)).toBe(true);
          const nearest = totals.filter((x) => x <= t + 1e-9).at(-1) as number;
          expect(l.loaded).toBeCloseTo(nearest, 6);
          expect(l.exact).toBe(lookup.has(t));
        }
      }),
      { numRuns: 20 },
    );
  });

  it("dialValues is sorted and unique, and contains current", () => {
    const equipment = fc.constantFrom<Equipment[]>("BARBELL", "EZ_BAR", "TRAP_BAR", "SMITH_MACHINE", "DUMBBELL", "KETTLEBELL", "MACHINE_SELECTORIZED", "MACHINE_PLATE_LOADED", "CABLE", "BODYWEIGHT", "OTHER");
    const loadType = fc.constantFrom<LoadType[]>("TOTAL", "PER_IMPLEMENT", "PLATES_PER_SIDE", "STACK", "BODYWEIGHT_PLUS", "NONE");
    fc.assert(
      fc.property(
        equipment,
        loadType,
        fc.constantFrom("KG" as const, "LB" as const),
        fc.constantFrom(0.5, 1, 2, 2.5, 5, 10),
        fc.option(fc.integer({ min: 0, max: 9000 }).map((n) => n / 10), { nil: null }),
        fc.option(fc.constantFrom(10, 15, 20, 25, 45), { nil: null }),
        (eq, lt, unit, step, current, barW) => {
          const v = dialValues({ equipment: eq, loadType: lt, unit, step, current, bar: barW });
          for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThan(v[i - 1] as number);
          if (current !== null) expect(v).toContain(current);
        },
      ),
      { numRuns: 200 },
    );
  });
});
