"use client";
import clsx from "clsx";
import { Star } from "lucide-react";
import { repo, useLive } from "@/client/repo";

/**
 * The star toggle: a 44px icon button with `aria-pressed`, vermilion outline when off and a filled star when on.
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

export function FavoriteButton({ exerciseId, name, initial = false, className }: FavoriteButtonProps) {
  const live = useLive(() => repo.favorites.isFavorite(exerciseId), [exerciseId]);
  const pressed = live ?? initial;
  return (
    <button
      type="button"
      className={clsx("favorite-button", className)}
      aria-pressed={pressed}
      aria-label={pressed ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
      onClick={() => {
        repo.favorites.toggle(exerciseId).catch((error: unknown) => console.warn("[favorites] could not toggle", error));
      }}
    >
      <Star aria-hidden="true" focusable="false" strokeWidth={2.25} />
    </button>
  );
}
