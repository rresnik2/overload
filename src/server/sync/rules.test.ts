import { describe, expect, it } from "vitest";
import { favoriteId } from "@/lib/ids";
import { mintUserCtx } from "@/server/auth/ctx";
import { entityRuleViolation } from "./rules";

const alice = mintUserCtx("alice");
const bob = mintUserCtx("bob");
const exerciseId = "83a024cb-efa6-5b1b-8cef-e115a267bd5b";
const other = "c48fba6b-6cc5-55c1-a5c6-33e149c64422";

describe("exerciseFavorite rules", () => {
  it("accepts the deterministic id", () => {
    expect(entityRuleViolation("exerciseFavorite", alice, favoriteId("alice", exerciseId), { exerciseId, position: "a0" })).toBeNull();
  });

  it("rejects a random (client-minted) id", () => {
    expect(entityRuleViolation("exerciseFavorite", alice, "01890a5d-ac96-774b-bcce-b302099a8057", { exerciseId, position: "a0" })).toMatch(/favoriteId/);
  });

  it("rejects another user's id space", () => {
    expect(entityRuleViolation("exerciseFavorite", bob, favoriteId("alice", exerciseId), { exerciseId, position: "a0" })).toMatch(/favoriteId/);
  });

  it("rejects re-pointing a favorite at another exercise", () => {
    expect(entityRuleViolation("exerciseFavorite", alice, favoriteId("alice", exerciseId), { exerciseId: other, position: "a0" })).toMatch(/favoriteId/);
  });

  it("rejects a missing exerciseId", () => {
    expect(entityRuleViolation("exerciseFavorite", alice, favoriteId("alice", exerciseId), { position: "a0" })).toMatch(/favoriteId/);
  });

  it("has no rules for other entities", () => {
    expect(entityRuleViolation("template", alice, "anything", { name: "x" })).toBeNull();
  });
});
