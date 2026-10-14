// Strength and body-composition scores. STUBS (stream D implements).
// Coefficients and check values are in docs/research.md. IPF GL / Wilks2 bench-only coefficients are [Verify]: keep them off until checked.
import type {
  Allometric,
  BodyweightTrend,
  Dots,
  Ffmi,
  IpfGl,
  NavyBodyFat,
  ResolveBodyFat,
} from "@/contracts/analytics";

export const dots: Dots = () => {
  throw new Error("not implemented: dots");
};

export const ipfGl: IpfGl = () => {
  throw new Error("not implemented: ipfGl");
};

export const allometric: Allometric = () => {
  throw new Error("not implemented: allometric");
};

export const ffmi: Ffmi = () => {
  throw new Error("not implemented: ffmi");
};

export const navyBodyFat: NavyBodyFat = () => {
  throw new Error("not implemented: navyBodyFat");
};

export const resolveBodyFat: ResolveBodyFat = () => {
  throw new Error("not implemented: resolveBodyFat");
};

export const bodyweightTrend: BodyweightTrend = () => {
  throw new Error("not implemented: bodyweightTrend");
};
