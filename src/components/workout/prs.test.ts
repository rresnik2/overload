import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { describePr } from "./prs";

describe("describePr", () => {
  it("rounds an estimate to one decimal, as Today does", () => {
    expect(describePr({ type: "E1RM", reps: 0, value: 117.1666 }, "KG")).toBe("Estimated 1RM 117.2 kg");
    expect(describePr({ type: "E1RM", reps: 0, value: 100 }, "KG")).toBe("Estimated 1RM 100 kg");
    expect(describePr({ type: "E1RM", reps: 0, value: 100 }, "LB")).toBe("Estimated 1RM 220.5 lb");
  });

  it("rounds volumes the same way and keeps a typed load exact", () => {
    expect(describePr({ type: "MAX_SET_VOLUME", reps: 0, value: 652.4999 }, "KG")).toBe("Set volume 652.5 kg");
    expect(describePr({ type: "MAX_SESSION_VOLUME", reps: 0, value: 4012.34 }, "KG")).toBe("Session volume 4012.3 kg");
    expect(describePr({ type: "MAX_LOAD", reps: 0, value: 41.25 }, "KG")).toBe("Heaviest set 41.25 kg");
    expect(describePr({ type: "REP_MAX", reps: 5, value: 82.5 }, "KG")).toBe("Best for 5 reps: 82.5 kg");
  });
});
