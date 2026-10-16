// Pure swipe maths (no DOM): shared by useSwipe and its tests. Horizontal intent only; vertical movement is the browser's scroll.
export type SwipeDirection = "left" | "right";
export type SwipeIntent = "pending" | "horizontal" | "vertical";

export const SWIPE = {
  /** Movement (px) before a gesture is classified at all, so taps and finger jitter stay taps. */
  slop: 10,
  /** A swipe is horizontal when |dx| > ratio * |dy|. */
  ratio: 1.5,
  /** Distance (px) that commits a swipe on its own. */
  distance: 64,
  /** Or a fling: at least this fast (px per ms) over at least `flingMin` px. */
  flingVelocity: 0.5,
  flingMin: 24,
  /** Edge-back gesture: the finger must land within this many px of the left edge. */
  edge: 20,
} as const;

/** Classify the movement so far. Vertical is sticky for the caller: it cancels and the page scrolls normally. */
export function classifyIntent(dx: number, dy: number): SwipeIntent {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (Math.max(adx, ady) < SWIPE.slop) return "pending";
  if (adx > SWIPE.ratio * ady) return "horizontal";
  if (ady >= adx) return "vertical";
  return "pending"; // a diagonal between 1:1 and 1.5:1 may still turn out horizontal; release decides
}

/** The swipe a release commits, or null: horizontal enough, and far enough or fast enough. */
export function resolveSwipe(dx: number, dy: number, elapsedMs: number): SwipeDirection | null {
  const adx = Math.abs(dx);
  if (!(adx > SWIPE.ratio * Math.abs(dy))) return null;
  const fling = adx >= SWIPE.flingMin && adx / Math.max(elapsedMs, 1) >= SWIPE.flingVelocity;
  if (adx < SWIPE.distance && !fling) return null;
  return dx < 0 ? "left" : "right";
}
