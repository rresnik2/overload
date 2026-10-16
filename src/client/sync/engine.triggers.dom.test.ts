import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newDevice, type TestDevice } from "@/client/repo/test-utils";
import { createEngine } from "./engine";
import { FakeServer } from "./fake-server";
import { createStatusStore, createSyncedListeners } from "./status";

const devices: TestDevice[] = [];
afterEach(() => {
  for (const d of devices.splice(0)) d.db.close();
});

describe("triggers", () => {
  it("syncs shortly after a write, on the interval while pending, and on the online/visibility events", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    try {
      const server = new FakeServer();
      const device = newDevice();
      devices.push(device);
      const status = createStatusStore();
      const engine = createEngine({ db: device.db, fetch: server.fetch as typeof fetch, status, listeners: createSyncedListeners(), writeDelayMs: 1500, intervalMs: 30_000 });
      const waitFor = async (cond: () => boolean) => {
        for (let i = 0; i < 200 && !cond(); i++) {
          await vi.advanceTimersByTimeAsync(50);
          await new Promise((r) => setImmediate(r));
        }
        expect(cond()).toBe(true);
      };
      engine.start();
      await waitFor(() => server.requests.length >= 1); // app start
      const startRequests = server.requests.length;

      await device.repo.templates.create({ name: "x", position: "a0" });
      await waitFor(() => server.requests.length > startRequests && server.rows("template").length === 1); // 1.5 s after the write
      expect(await device.db.outbox.count()).toBe(0);

      server.offline = true;
      await device.repo.templates.create({ name: "y", position: "a1" });
      await vi.advanceTimersByTimeAsync(2000);
      server.offline = false;
      const before = server.requests.length;
      await vi.advanceTimersByTimeAsync(31_000); // the 30 s interval retries while pending
      await waitFor(() => server.requests.length > before && server.rows("template").length === 2);

      await waitFor(() => status.get().state === "idle"); // events during a running sync are (correctly) skipped
      const beforeOnline = server.requests.length;
      window.dispatchEvent(new Event("online"));
      await waitFor(() => server.requests.length > beforeOnline);
      await waitFor(() => status.get().state === "idle");
      const beforeVisible = server.requests.length;
      document.dispatchEvent(new Event("visibilitychange")); // within 30 s of the last sync: throttled, no request
      await vi.advanceTimersByTimeAsync(100);
      expect(server.requests.length).toBe(beforeVisible);
      await vi.advanceTimersByTimeAsync(31_000);
      document.dispatchEvent(new Event("visibilitychange"));
      await waitFor(() => server.requests.length > beforeVisible);
      engine.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
