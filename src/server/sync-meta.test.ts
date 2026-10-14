import { describe, expect, it } from "vitest";
import { HLC_REGEX, compareHlc } from "@/contracts/sync";
import { serverHlc, syncMixin } from "./sync-meta";

describe("server HLC and sync mixin", () => {
  it("produces HLCs in the frozen format that sort by time", () => {
    const a = serverHlc(1_791_990_000_000);
    expect(a).toBe("001791990000000-00000-server");
    expect(HLC_REGEX.test(a)).toBe(true);
    expect(compareHlc(serverHlc(1_791_990_000_001), a)).toBe(1);
    expect(compareHlc(serverHlc(1_791_990_000_000, 1), a)).toBe(1);
  });

  it("stamps every written field", () => {
    const m = syncMixin(7, ["weightKg", "localDate"], 1_791_990_000_000);
    expect(m.version).toBe(7);
    expect(m.fieldHlc).toEqual({ weightKg: m.hlc, localDate: m.hlc });
  });
});
