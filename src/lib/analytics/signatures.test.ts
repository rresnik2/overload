// Compile-time guard: every analytics export satisfies its frozen contract type, and the module exports exist.
// (Stream D replaces the stub bodies; this test must keep passing untouched.)
import { describe, expect, expectTypeOf, it } from "vitest";
import type * as C from "@/contracts/analytics";
import type { BuildWeeklyFacts } from "@/contracts/insights";
import { estimate1RM } from "./e1rm";
import { buildWeeklyFacts } from "./facts";
import { forecastE1rm } from "./forecast";
import { INSIGHT_RULES, runInsightRules } from "./insights/rules";
import { effectiveLoadKg } from "./load";
import { detectStall, suggestProgression } from "./progression";
import { allometric, bodyweightTrend, dots, ffmi, ipfGl, navyBodyFat, resolveBodyFat } from "./scores";
import { sessionBestE1rm } from "./series";
import { strengthPercentile } from "./standards";
import { isHardSet, weeklyMuscleVolume } from "./volume";
import { INSIGHT_RULE_IDS } from "@/contracts/analytics";

describe("analytics signatures", () => {
  it("exports every contract function with the contract type", () => {
    expectTypeOf(estimate1RM).toEqualTypeOf<C.Estimate1RM>();
    expectTypeOf(effectiveLoadKg).toEqualTypeOf<C.EffectiveLoadKg>();
    expectTypeOf(isHardSet).toEqualTypeOf<C.IsHardSet>();
    expectTypeOf(weeklyMuscleVolume).toEqualTypeOf<C.WeeklyMuscleVolume>();
    expectTypeOf(sessionBestE1rm).toEqualTypeOf<C.SessionBestE1rm>();
    expectTypeOf(forecastE1rm).toEqualTypeOf<C.ForecastE1rm>();
    expectTypeOf(detectStall).toEqualTypeOf<C.DetectStall>();
    expectTypeOf(suggestProgression).toEqualTypeOf<C.SuggestProgression>();
    expectTypeOf(dots).toEqualTypeOf<C.Dots>();
    expectTypeOf(ipfGl).toEqualTypeOf<C.IpfGl>();
    expectTypeOf(allometric).toEqualTypeOf<C.Allometric>();
    expectTypeOf(ffmi).toEqualTypeOf<C.Ffmi>();
    expectTypeOf(navyBodyFat).toEqualTypeOf<C.NavyBodyFat>();
    expectTypeOf(resolveBodyFat).toEqualTypeOf<C.ResolveBodyFat>();
    expectTypeOf(bodyweightTrend).toEqualTypeOf<C.BodyweightTrend>();
    expectTypeOf(strengthPercentile).toEqualTypeOf<C.StrengthPercentileFn>();
    expectTypeOf(runInsightRules).toEqualTypeOf<C.RunInsightRules>();
    expectTypeOf(buildWeeklyFacts).toEqualTypeOf<BuildWeeklyFacts>();
    for (const fn of [
      estimate1RM, effectiveLoadKg, isHardSet, weeklyMuscleVolume, sessionBestE1rm, forecastE1rm, detectStall,
      suggestProgression, dots, ipfGl, allometric, ffmi, navyBodyFat, resolveBodyFat, bodyweightTrend,
      strengthPercentile, runInsightRules, buildWeeklyFacts,
    ]) {
      expect(typeof fn).toBe("function");
    }
  });

  it("has exactly one rule per insight rule id", () => {
    expect(Object.keys(INSIGHT_RULES)).toEqual([...INSIGHT_RULE_IDS]);
    expect(INSIGHT_RULE_IDS).toHaveLength(10);
  });
});
