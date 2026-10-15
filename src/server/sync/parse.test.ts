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

  it("rejects a bad envelope outright", () => {
    expect(parseSyncBody({ ...exampleSyncRequest, cursor: -1 }).ok).toBe(false);
    expect(parseSyncBody({ ...exampleSyncRequest, userId: "x" }).ok).toBe(false);
    expect(parseSyncBody("nope").ok).toBe(false);
    expect(parseSyncBody({ ...exampleSyncRequest, mutations: "x" }).ok).toBe(false);
  });
});
