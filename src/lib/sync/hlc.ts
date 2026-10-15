// Hybrid logical clock (pure). The string format is frozen in src/contracts/sync.ts:
//   `${wallMs, 15 digits}-${counter, 5 hex digits}-${nodeId}`  (fixed widths: string order IS causal order).
// Shared by the client (every local write ticks the clock; every server reply is `receive`d) and the server
// (clamping client HLCs, minting its own).
import { HLC_REGEX, SYNC_MAX_CLOCK_SKEW_MS, type Hlc } from "@/contracts/sync";

export interface HlcParts {
  wallMs: number;
  counter: number;
  nodeId: string;
}

/** The counter is 5 hex digits. */
export const HLC_MAX_COUNTER = 0xfffff;

export function formatHlc({ wallMs, counter, nodeId }: HlcParts): Hlc {
  if (counter > HLC_MAX_COUNTER) return formatHlc({ wallMs: wallMs + 1, counter: 0, nodeId });
  return `${String(wallMs).padStart(15, "0")}-${counter.toString(16).padStart(5, "0")}-${nodeId}`;
}

export function parseHlc(hlc: string): HlcParts | null {
  if (!HLC_REGEX.test(hlc)) return null;
  const first = hlc.indexOf("-");
  const second = hlc.indexOf("-", first + 1);
  return {
    wallMs: Number(hlc.slice(0, first)),
    counter: Number.parseInt(hlc.slice(first + 1, second), 16),
    nodeId: hlc.slice(second + 1),
  };
}

/** The largest HLC in a field -> HLC map ("" when empty). A row's `hlc` is the max of its field HLCs. */
export function maxHlc(values: Iterable<string>): Hlc {
  let best = "";
  for (const v of values) if (v > best) best = v;
  return best;
}

/**
 * Clamp an HLC whose wall time is more than `maxSkewMs` ahead of `nowMs` down to `nowMs + maxSkewMs`
 * (a fast client clock must not win every future conflict). Counter and nodeId are kept.
 */
export function clampHlc(hlc: Hlc, nowMs: number, maxSkewMs: number = SYNC_MAX_CLOCK_SKEW_MS): Hlc {
  const parts = parseHlc(hlc);
  if (!parts) return hlc;
  const limit = nowMs + maxSkewMs;
  return parts.wallMs > limit ? formatHlc({ ...parts, wallMs: limit }) : hlc;
}

export interface HlcClock {
  /** The current clock value without advancing it (what a request sends as `clientHlc`). */
  now(): Hlc;
  /** A new HLC strictly greater than every HLC this clock issued or received. Call once per local write. */
  tick(): Hlc;
  /** Merge a remote HLC (e.g. `serverHlc`): afterwards the clock is greater than it. A remote far ahead of local time is clamped. */
  receive(remote: Hlc): Hlc;
  /** The last value (persist this and pass it back as `initial`). */
  last(): Hlc;
}

export interface HlcClockOptions {
  nodeId: string;
  /** Wall clock in ms. Default Date.now. */
  now?: () => number;
  /** Persisted last value. */
  initial?: Hlc | null;
  maxSkewMs?: number;
}

export function createHlcClock(options: HlcClockOptions): HlcClock {
  const { nodeId, now = Date.now, maxSkewMs = SYNC_MAX_CLOCK_SKEW_MS } = options;
  const initial = options.initial ? parseHlc(options.initial) : null;
  let wall = initial?.wallMs ?? 0;
  let counter = initial?.counter ?? 0;

  const set = (w: number, c: number) => {
    if (c > HLC_MAX_COUNTER) {
      wall = w + 1;
      counter = 0;
    } else {
      wall = w;
      counter = c;
    }
  };
  const current = () => formatHlc({ wallMs: wall, counter, nodeId });

  return {
    now() {
      const pt = now();
      return pt > wall ? formatHlc({ wallMs: pt, counter: 0, nodeId }) : current();
    },
    tick() {
      const pt = now();
      if (pt > wall) set(pt, 0);
      else set(wall, counter + 1);
      return current();
    },
    receive(remote) {
      const pt = now();
      const parsed = parseHlc(clampHlc(remote, pt, maxSkewMs));
      const rw = parsed?.wallMs ?? 0;
      const rc = parsed?.counter ?? 0;
      const next = Math.max(wall, rw, pt);
      if (next === wall && next === rw) set(next, Math.max(counter, rc) + 1);
      else if (next === wall) set(next, counter + 1);
      else if (next === rw) set(next, rc + 1);
      else set(next, 0);
      return current();
    },
    last: current,
  };
}
