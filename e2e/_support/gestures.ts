// Touch gestures for e2e. Playwright's touchscreen only taps, so a swipe is a sequence of synthetic PointerEvents (pointerType "touch")
// dispatched on the element the finger lands on, the way a real touch pointer is captured to its down target. The app listens for
// pointer events on windows/ancestors, so these exercise the same code as a finger would (minus the browser's own scroll handling).
import type { Locator } from "@playwright/test";

export interface SwipeOptions {
  /** Where the finger lands, relative to the element's top-left corner (default: its centre). */
  from?: { x: number; y: number };
  /** Total travel in CSS px. */
  dx: number;
  dy?: number;
  steps?: number;
  /** Total duration in ms (default 160: a quick flick). */
  ms?: number;
  pointerType?: "touch" | "pen" | "mouse";
  /** Skip the final pointerup (to inspect mid-gesture state), and finish later with `releaseSwipe`. */
  hold?: boolean;
}

/** Drag a finger across `target`. Resolves once the last event has been dispatched. */
export async function swipe(target: Locator, opts: SwipeOptions): Promise<void> {
  await target.evaluate(
    async (el, o) => {
      const rect = el.getBoundingClientRect();
      const x0 = rect.left + (o.from?.x ?? rect.width / 2);
      const y0 = rect.top + (o.from?.y ?? rect.height / 2);
      const type = o.pointerType ?? "touch";
      const make = (name: string, x: number, y: number) =>
        new PointerEvent(name, { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: type, isPrimary: true, clientX: x, clientY: y, button: name === "pointermove" ? -1 : 0, buttons: name === "pointerup" ? 0 : 1 });
      const steps = o.steps ?? 8;
      const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
      el.dispatchEvent(make("pointerdown", x0, y0));
      for (let i = 1; i <= steps; i++) {
        await wait((o.ms ?? 160) / steps);
        el.dispatchEvent(make("pointermove", x0 + ((o.dx * i) / steps), y0 + (((o.dy ?? 0) * i) / steps)));
      }
      if (!o.hold) el.dispatchEvent(make("pointerup", x0 + o.dx, y0 + (o.dy ?? 0)));
      else (window as unknown as { __swipeEnd?: () => void }).__swipeEnd = () => el.dispatchEvent(make("pointerup", x0 + o.dx, y0 + (o.dy ?? 0)));
    },
    opts,
  );
}

/** Lift the finger of a swipe started with `hold: true`. */
export async function releaseSwipe(target: Locator): Promise<void> {
  await target.evaluate(() => (window as unknown as { __swipeEnd?: () => void }).__swipeEnd?.());
}
