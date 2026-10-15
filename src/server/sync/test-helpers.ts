// Shared helpers for the sync integration tests (a fake "device" that builds valid mutations with its own HLC clock).
import type { EntityName } from "@/contracts/entities";
import type { Mutation, SyncRequest, SyncResponse } from "@/contracts/sync";
import { createHlcClock, type HlcClock } from "@/lib/sync/hlc";
import { newId } from "@/lib/ids";
import type { UserCtx } from "@/server/auth/ctx";
import { applyServerMutations } from "./apply";

export class FakeDevice {
  readonly clock: HlcClock;
  cursor = 0;

  constructor(
    readonly ctx: UserCtx,
    readonly deviceId: string,
    now: () => number = Date.now,
  ) {
    this.clock = createHlcClock({ nodeId: deviceId, now });
  }

  /** A valid mutation: one fresh HLC shared by every field in `fields`. */
  mutation(entity: EntityName, id: string, fields: Record<string, unknown>, hlc: string = this.clock.tick()): Mutation {
    return {
      mutationId: newId(),
      entity,
      id,
      fields,
      fieldHlc: Object.fromEntries(Object.keys(fields).map((f) => [f, hlc])),
    } as Mutation;
  }

  request(mutations: Mutation[], cursor = this.cursor): SyncRequest {
    return { deviceId: this.deviceId, cursor, clientHlc: this.clock.now(), mutations };
  }

  async push(mutations: Mutation[], cursor = this.cursor): Promise<SyncResponse> {
    const response = await applyServerMutations(this.ctx, this.request(mutations, cursor));
    this.clock.receive(response.serverHlc);
    this.cursor = response.cursor;
    return response;
  }
}

export const NOW_ISO = "2026-10-12T17:00:00.000Z";

export const exerciseFields = (over: Record<string, unknown> = {}) => ({
  slug: "test-press",
  name: "Test Press",
  modality: "FREE_WEIGHT",
  equipment: "BARBELL",
  loadType: "TOTAL",
  ...over,
});
export const workoutFields = (over: Record<string, unknown> = {}) => ({
  startedAt: NOW_ISO,
  localDate: "2026-10-12",
  timezone: "UTC",
  ...over,
});
export const setFields = (workoutExerciseId: string, over: Record<string, unknown> = {}) => ({
  workoutExerciseId,
  position: "a0",
  setType: "WORKING",
  weightKg: 100,
  reps: 5,
  rir: 0,
  completedAt: NOW_ISO,
  ...over,
});
