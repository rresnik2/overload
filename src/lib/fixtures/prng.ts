// Seeded PRNG for fixtures. Deterministic: the same seed always gives the same sequence. Never uses Math.random or Date.
import { v5 as uuidv5 } from "uuid";

/** mulberry32: small, fast, good enough for fixtures. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** Uniform in [0, 1). */
    next,
    /** Uniform in [lo, hi). */
    range: (lo: number, hi: number) => lo + (hi - lo) * next(),
    /** Integer in [lo, hi] inclusive. */
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    /** Standard normal (Box-Muller). */
    gaussian: () => {
      const u = Math.max(next(), 1e-12);
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
    },
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
  };
}
export type Rng = ReturnType<typeof createRng>;

/** Namespace for fixture row ids: uuidv5("overload.fixtures", DNS). */
export const FIXTURE_NAMESPACE = uuidv5("overload.fixtures", uuidv5.DNS);

/** Deterministic UUID for a fixture row, so re-seeding produces the same ids (idempotent seeds). */
export function fixtureId(key: string): string {
  return uuidv5(key, FIXTURE_NAMESPACE);
}
