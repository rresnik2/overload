// Logging a set in the browser, on both layouts: a desktop with a mouse types into the inline row; a phone (or any narrow or touch
// screen) shows the active-set panel, where the weight is typed through its readout and reps are picked on the number strip.
import { expect, type Locator } from "@playwright/test";

/** Reps on the strip, by keyboard: Home is 1, each ArrowRight one more. */
export async function setRepsOnStrip(block: Locator, n: number, reps: number) {
  const strip = block.getByRole("spinbutton", { name: `Set ${n} reps` });
  await strip.focus();
  await strip.press("Home");
  for (let i = 1; i < reps; i++) await strip.press("ArrowRight");
  await expect(strip).toHaveAttribute("aria-valuenow", String(reps));
}

/** Turn the weight dial with the keyboard on its hidden range: Home is the lowest value, PageUp is four steps. */
export async function dialWeight(block: Locator, n: number, keys: string[]) {
  const dial = block.getByRole("slider", { name: `Set ${n} weight` });
  await dial.focus();
  for (const key of keys) await dial.press(key);
  return dial;
}

/**
 * Fill in set `n` (1-based, the next one to do) by typing and log it. Works on the desktop row (type, then the check) and on the
 * phone panel (tap the number, type, pick reps, Log set).
 */
export async function logSetByTyping(block: Locator, n: number, weight: string, reps: string, phone: boolean) {
  if (!phone) {
    await block.getByRole("textbox", { name: new RegExp(`^Set ${n} weight`) }).fill(weight);
    await block.getByRole("textbox", { name: `Set ${n} reps` }).fill(reps);
    await block.getByRole("button", { name: `Complete set ${n}` }).click();
    await expect(block.getByRole("button", { name: `Mark set ${n} not done` })).toBeVisible();
    return;
  }
  await block.getByRole("button", { name: new RegExp(`^Set ${n} weight`) }).click();
  const input = block.getByRole("textbox", { name: new RegExp(`^Type set ${n} weight`) });
  await input.fill(weight);
  await input.press("Enter");
  await setRepsOnStrip(block, n, Number(reps));
  await block.getByRole("button", { name: /^Log set/ }).click();
  await expect(block.getByRole("button", { name: "Logged ✓" })).toBeVisible();
}
