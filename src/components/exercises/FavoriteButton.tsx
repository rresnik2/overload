"use client";
import clsx from "clsx";
import { Star } from "lucide-react";
import { repo } from "@/client/repo";
import { useFavoriteIds } from "@/client/repo/use-favorite-ids";
import { syncNow } from "@/client/sync";
import { RepoError } from "@/contracts/repo";

/**
 * The star toggle: a 44px icon button with `aria-pressed`, neutral outline when off and a filled star when on.
 * State is the local database (`repo.favorites`), so it works offline and syncs like any other write. `initial` is the
 * server-rendered state, used until the local database answers (and during SSR) so the first paint does not flicker.
 */
export interface FavoriteButtonProps {
  exerciseId: string;
  /** Used in the accessible label: "Add {name} to favorites" / "Remove {name} from favorites". */
  name: string;
  initial?: boolean;
  className?: string;
}

const CATALOG_RETRIES = 5;

/**
 * Starring needs the exercise in the local database. Right after sign-in the catalog may still be on its way (it arrives with
 * the first sync), so a NOT_FOUND triggers a sync and a retry instead of silently doing nothing.
 */
async function toggleFavorite(exerciseId: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await repo.favorites.toggle(exerciseId);
      return;
    } catch (error) {
      if (!(error instanceof RepoError) || error.code !== "NOT_FOUND" || attempt >= CATALOG_RETRIES) throw error;
      await syncNow("manual");
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
}

export function FavoriteButton({ exerciseId, name, initial = false, className }: FavoriteButtonProps) {
  const favoriteIds = useFavoriteIds(); // one shared live query for every star on the page
  const pressed = favoriteIds ? favoriteIds.has(exerciseId) : initial;
  return (
    <button
      type="button"
      className={clsx("favorite-button", className)}
      aria-pressed={pressed}
      aria-label={pressed ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
      onClick={() => {
        toggleFavorite(exerciseId).catch((error: unknown) => console.warn("[favorites] could not toggle", error));
      }}
    >
      <Star aria-hidden="true" focusable="false" strokeWidth={2.25} />
    </button>
  );
}
