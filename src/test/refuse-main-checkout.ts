// Vitest globalSetup of the `integration` project (vitest.config.ts). The unit and dom projects do not load it, so
// `pnpm check` still runs in the main checkout.
import { mainCheckoutRefusal } from "./main-checkout-guard";

export default function setup(): void {
  const refusal = mainCheckoutRefusal("integration tests");
  if (refusal) throw new Error(refusal);
}
