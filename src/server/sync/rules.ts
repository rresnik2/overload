import "server-only";
// Per-entity rules that go beyond shape and references, checked on the MERGED values of a row before it is written.
// A violation rejects the whole row's mutations (INVALID_SHAPE + dead letter) without blocking the rest of the batch.
import type { EntityName } from "@/contracts/entities";
import { favoriteId } from "@/lib/ids";
import type { FieldValues } from "@/lib/sync/merge";
import type { UserCtx } from "@/server/auth/ctx";

/** A human-readable reason when `values` may not be stored under `id` for this user, else null. */
export function entityRuleViolation(entity: EntityName, ctx: UserCtx, id: string, values: FieldValues): string | null {
  if (entity === "exerciseFavorite") {
    // The id IS the (user, exercise) pair: a client can neither mint ids in another user's space nor re-point a favorite.
    const exerciseId = values.exerciseId;
    if (typeof exerciseId !== "string" || id !== favoriteId(ctx.id, exerciseId)) {
      return "An exerciseFavorite id must equal favoriteId(user, exerciseId)";
    }
  }
  return null;
}
