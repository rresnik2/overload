// PR detection. STUBS (stream E1 implements). Pure: shared by the server (rebuild) and the client (live toast).
import type { ComputeSeriesPrs, DetectNewPrs } from "@/contracts/prs";

export const computeSeriesPrs: ComputeSeriesPrs = () => {
  throw new Error("not implemented: computeSeriesPrs");
};

export const detectNewPrs: DetectNewPrs = () => {
  throw new Error("not implemented: detectNewPrs");
};
