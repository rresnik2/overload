// Design-review fixes on a phone (390x844): the first view of an exercise's dial panel, the sync wording, "Workout saved" -> Today,
// the history page title and the estimate's rounding. Unit and DOM tests cover the rest (set-to-set weight, ghost caption, copy).
//   PORT=3002 pnpm exec playwright test e2e/journeys/design-fixes.spec.ts --project=android-chrome
import { expect, test } from "@playwright/test";
import { logSetByTyping } from "../_support/logging";
import { createUser } from "../_support/user";

const BENCH = "Barbell Bench Press - Medium Grip";
const COLD = { timeout: 60_000 };

test.describe("design fixes at 390x844", () => {
  test.skip(({ isMobile }) => !isMobile, "the dial panel is the phone layout");

  test("a new exercise's dial is clear of Log set, the header and the bar agree, Done goes to Today, history is titled by name", async ({ page }) => {
    test.setTimeout(240_000);
    await createUser(page, { tag: "design", name: "Design Fixer" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/workout");
    await page.getByRole("button", { name: "Start empty workout" }).click();
    const name = page.getByRole("textbox", { name: "Workout name" });
    await expect(name).toBeVisible(COLD);
    await name.fill("Upper B");
    await name.blur();

    await page.getByRole("button", { name: "Add exercise" }).first().click();
    const picker = page.getByRole("dialog");
    await expect(picker.locator(".exercise-card").first()).toBeVisible({ timeout: 90_000 });
    await picker.getByPlaceholder("Search exercises").fill("barbell bench press");
    await picker.getByRole("button", { name: `Add ${BENCH}`, exact: true }).first().click();
    const bench = page.getByRole("region", { name: BENCH });
    await expect(bench).toBeVisible(COLD);
    await expect(picker).toBeHidden();

    // Fresh exercise, no history: nothing to log yet, so Log set is disabled. Its backing is opaque, whatever it rides over.
    const logRow = bench.locator(".wk-panel__logrow");
    const log = bench.getByRole("button", { name: /^Log set/ });
    await expect(log).toBeDisabled();
    const paint = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>(".wk-panel__logrow")!;
      const button = document.querySelector<HTMLElement>(".wk-panel__log")!;
      // "rgb(…)" and "color(… / a)" carry an alpha only when it is not 1: rgba(r, g, b, a), or "/ a" before the closing bracket.
      const alpha = (css: string) => (/^rgba\(.*,\s*([\d.]+)\)$/.exec(css)?.[1] ?? /\/\s*([\d.]+)\s*\)$/.exec(css)?.[1] ?? "1");
      return { rowAlpha: alpha(getComputedStyle(row).backgroundColor), buttonAlpha: alpha(getComputedStyle(button).backgroundColor), opacity: getComputedStyle(button).opacity };
    });
    expect(paint).toEqual({ rowAlpha: "1", buttonAlpha: "1", opacity: "1" });

    // The page brings the new panel up, so the whole dial shows above the sticky row (and below the sticky bar) on the first view.
    await expect
      .poll(
        async () => {
          const dial = await bench.locator(".dial__face").boundingBox();
          const row = await logRow.boundingBox();
          const bar = await page.locator(".wk-topbar").boundingBox();
          return dial && row && bar ? { clearOfLog: dial.y + dial.height <= row.y + 0.5, clearOfBar: dial.y >= bar.y + bar.height - 0.5 } : null;
        },
        { timeout: 10_000, message: "the dial is fully visible on the first view" },
      )
      .toEqual({ clearOfLog: true, clearOfBar: true });

    // The header chip and the workout bar say the same thing about what is waiting to sync.
    const syncNow = page.getByRole("button", { name: /^Sync now:/ });
    await expect(syncNow).toContainText(/\d+ unsynced/, COLD);
    const waiting = (await syncNow.innerText()).trim();
    await expect(page.locator(".wk-topbar .sync-pip")).toHaveText(waiting);

    // A heavier second set beats the first: 62.5 x 7 estimates 77.083...; the finish sheet shows it to one decimal, as Today does.
    await logSetByTyping(bench, 1, "60", "5", true);
    const toasts = page.locator(".toast-region .toast");
    for (let i = 0; i < 3 && (await toasts.count()) > 0; i++) await page.getByRole("button", { name: "Dismiss notification" }).first().click();
    const addSet = bench.getByRole("button", { name: `Add set to ${BENCH}` });
    await addSet.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await addSet.click();
    await logSetByTyping(bench, 2, "62.5", "7", true);
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await page.getByRole("button", { name: "Finish workout" }).click();
    await expect(page.getByRole("heading", { name: "Workout saved" })).toBeVisible(COLD);
    await expect(page.getByTestId("finish-summary")).toContainText("Estimated 1RM 77.1 kg");

    // Done leaves the empty start screen behind: Today.
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page).toHaveURL(/\/today$/, COLD);
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible(COLD); // the navigation has landed before the next one starts

    // The saved workout's page is titled with its name.
    await page.goto("/history");
    await page.getByRole("link", { name: /Upper B/ }).first().click();
    await expect(page).toHaveURL(/\/history\/[0-9a-f-]+$/, COLD);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Upper B", COLD);
  });

  test("a dumbbell exercise opens with its dial clear of Log set too, and its caption asks for a weight", async ({ page }) => {
    test.setTimeout(180_000);
    await createUser(page, { tag: "design-db", name: "Design Dumbbell" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/workout");
    await page.getByRole("button", { name: "Start empty workout" }).click();
    await expect(page.getByRole("textbox", { name: "Workout name" })).toBeVisible(COLD);
    await page.getByRole("button", { name: "Add exercise" }).first().click();
    const picker = page.getByRole("dialog");
    await expect(picker.locator(".exercise-card").first()).toBeVisible({ timeout: 90_000 });
    await picker.getByPlaceholder("Search exercises").fill("dumbbell bench press");
    await picker.getByRole("button", { name: "Add Dumbbell Bench Press", exact: true }).first().click();
    const block = page.getByRole("region", { name: "Dumbbell Bench Press" });
    await expect(block).toBeVisible(COLD);
    await expect(block.locator(".eq__caption")).toContainText("Turn the dial to choose a weight");
    await expect
      .poll(async () => {
        const dial = await block.locator(".dial__face").boundingBox();
        const row = await block.locator(".wk-panel__logrow").boundingBox();
        return dial && row ? dial.y + dial.height <= row.y + 0.5 : null;
      }, { timeout: 10_000, message: "the dial is fully visible on the first view" })
      .toBe(true);
  });
});
