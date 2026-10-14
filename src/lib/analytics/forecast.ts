// e1RM forecast. STUB (stream D implements).
import type { ForecastE1rm } from "@/contracts/analytics";

/** Bayesian linear regression on ln(t + t0); needs >= 6 sessions over >= 3 weeks; <= 12-week horizon; 50%/80% bands. */
export const forecastE1rm: ForecastE1rm = () => {
  throw new Error("not implemented: forecastE1rm");
};
