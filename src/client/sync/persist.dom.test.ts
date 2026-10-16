import { afterEach, describe, expect, it, vi } from "vitest";
import { ensurePersistentStorage } from "./persist";

function stubStorage(storage: Partial<StorageManager> | undefined) {
  Object.defineProperty(navigator, "storage", { configurable: true, value: storage });
}

afterEach(() => {
  localStorage.clear();
  Reflect.deleteProperty(navigator, "storage");
});

describe("ensurePersistentStorage", () => {
  it("asks the browser to persist, at most twice, and never when already persisted", async () => {
    const persist = vi.fn(async () => false);
    stubStorage({ persist, persisted: async () => false });
    await ensurePersistentStorage();
    await ensurePersistentStorage();
    await ensurePersistentStorage();
    expect(persist).toHaveBeenCalledTimes(2);

    localStorage.clear();
    const again = vi.fn(async () => true);
    stubStorage({ persist: again, persisted: async () => true });
    await ensurePersistentStorage();
    expect(again).not.toHaveBeenCalled();
  });

  it("does nothing where the API is missing, and swallows errors", async () => {
    stubStorage(undefined);
    await expect(ensurePersistentStorage()).resolves.toBeUndefined();
    stubStorage({
      persist: async () => {
        throw new Error("denied");
      },
    });
    await expect(ensurePersistentStorage()).resolves.toBeUndefined();
  });
});
