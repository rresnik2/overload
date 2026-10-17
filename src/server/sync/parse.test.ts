import { describe, expect, it } from "vitest";
import { FIXTURE_IDS, exampleSyncRequest } from "@/contracts/fixtures";
import { parseSyncBody } from "./parse";

describe("parseSyncBody", () => {
  it("accepts a fully valid request unchanged", () => {
    const parsed = parseSyncBody(exampleSyncRequest);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.slots.every((s) => s.kind === "ok")).toBe(true);
      expect(parsed.envelope.cursor).toBe(exampleSyncRequest.cursor);
    }
  });

  it("turns a bad mutation into a per-mutation invalid slot without failing the batch", () => {
    const good = exampleSyncRequest.mutations[0];
    const bad = { mutationId: FIXTURE_IDS.mutation, entity: "workoutSet", id: FIXTURE_IDS.workoutSet, fields: { userId: "someone-else" }, fieldHlc: { userId: "x" } };
    const parsed = parseSyncBody({ ...exampleSyncRequest, mutations: [bad, good] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.slots.map((s) => s.kind)).toEqual(["invalid", "ok"]);
    const first = parsed.slots[0];
    expect(first?.kind === "invalid" && first.mutationId).toBe(FIXTURE_IDS.mutation);
  });

  it("marks a machine profile mutation with an invalid platesKg as invalid, and a valid one as ok", () => {
    const hlc = exampleSyncRequest.clientHlc;
    const make = (platesKg: unknown) => ({
      mutationId: FIXTURE_IDS.mutation,
      entity: "machineProfile",
      id: FIXTURE_IDS.machineProfile,
      fields: { platesKg },
      fieldHlc: { platesKg: hlc },
    });
    const kinds = (platesKg: unknown) => {
      const parsed = parseSyncBody({ ...exampleSyncRequest, mutations: [make(platesKg)] });
      return parsed.ok ? parsed.slots.map((s) => s.kind) : [];
    };
    expect(kinds([25, 20, 1.25])).toEqual(["ok"]);
    expect(kinds(null)).toEqual(["ok"]);
    expect(kinds([150])).toEqual(["invalid"]);
    expect(kinds(Array.from({ length: 21 }, () => 5))).toEqual(["invalid"]);
    expect(kinds("25,20")).toEqual(["invalid"]);
  });

  it("rejects a bad envelope outright", () => {
    expect(parseSyncBody({ ...exampleSyncRequest, cursor: -1 }).ok).toBe(false);
    expect(parseSyncBody({ ...exampleSyncRequest, userId: "x" }).ok).toBe(false);
    expect(parseSyncBody("nope").ok).toBe(false);
    expect(parseSyncBody({ ...exampleSyncRequest, mutations: "x" }).ok).toBe(false);
  });
});
