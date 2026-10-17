import { describe, expect, it } from "vitest";
import { toDbData } from "./entities";

describe("toDbData", () => {
  it("writes a machine profile's platesKg as a list: null becomes the empty list (Prisma lists are never null)", () => {
    expect(toDbData("machineProfile", { name: "Bar", platesKg: [25, 1.25] })).toEqual({ name: "Bar", platesKg: [25, 1.25] });
    expect(toDbData("machineProfile", { platesKg: null })).toEqual({ platesKg: [] });
    expect(toDbData("machineProfile", { baseLoadKg: null })).toEqual({ baseLoadKg: null });
  });
});
