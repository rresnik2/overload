import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newDevice, type TestDevice } from "@/client/repo/test-utils";
import { createEngine, type Engine } from "./engine";
import { FakeServer } from "./fake-server";
import { createStatusStore, createSyncedListeners } from "./status";

// The sync policy (see the header of engine.ts): what triggers a request outside a workout and during one. Fake timers and a fake
// clock; the workout flag is a variable, and its change events are fired by hand.

const MIN = 60_000;

const devices: TestDevice[] = [];
let engine: Engine | null = null;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
});
afterEach(() => {
  engine?.stop();
  engine = null;
  for (const d of devices.splice(0)) d.db.close();
  vi.useRealTimers();
});

async function flush() {
  for (let i = 0; i < 40; i++) {
    await vi.advanceTimersByTimeAsync(5);
    await new Promise((r) => setImmediate(r));
  }
}
/** Advance fake time in 5 s steps (so the 30 s tick and every timer run in order), letting promises settle between steps. */
async function advance(ms: number) {
  for (let left = ms; left > 0; left -= 5_000) {
    await vi.advanceTimersByTimeAsync(Math.min(5_000, left));
    await new Promise((r) => setImmediate(r));
  }
  await flush();
}

function setup() {
  const server = new FakeServer();
  const device = newDevice();
  devices.push(device);
  const flag = { active: false };
  const listeners = new Set<(active: boolean) => void>();
  engine = createEngine({
    db: device.db,
    fetch: server.fetch as typeof fetch,
    status: createStatusStore(),
    listeners: createSyncedListeners(),
    onWorkoutActiveChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isWorkoutActive: () => flag.active,
  });
  const setWorkout = (active: boolean) => {
    flag.active = active;
    for (const l of [...listeners]) l(active);
  };
  return { server, device, engine, setWorkout, flag };
}

const write = (device: TestDevice, name: string) => device.repo.templates.create({ name, position: `a${Math.random().toString(36).slice(2, 6)}` });
const visible = () => document.dispatchEvent(new Event("visibilitychange"));

describe("outside a workout", () => {
  it("syncs once at start, then 1.5 s after a write", async () => {
    const { server, device, engine } = setup();
    engine.start();
    await flush();
    expect(server.requests).toHaveLength(1); // start
    await write(device, "a");
    await advance(1_000);
    expect(server.requests).toHaveLength(1);
    await advance(1_000);
    expect(server.requests).toHaveLength(2);
    expect(server.rows("template")).toHaveLength(1);
    expect(await device.db.outbox.count()).toBe(0);
  });

  it("retries every 30 s while changes are pending", async () => {
    const { server, device, engine } = setup();
    engine.start();
    await flush();
    server.offline = true;
    await write(device, "a");
    await advance(2_000);
    server.offline = false;
    const before = server.requests.length;
    await advance(30_000);
    expect(server.requests.length).toBeGreaterThan(before);
    expect(server.rows("template")).toHaveLength(1);
  });

  it("throttles visibility syncs to one per 30 s", async () => {
    const { server, engine } = setup();
    engine.start();
    await flush();
    expect(server.requests).toHaveLength(1);
    visible(); // 0 s after the start sync
    await flush();
    expect(server.requests).toHaveLength(1);
    await advance(29_000);
    visible();
    await flush();
    expect(server.requests).toHaveLength(1);
    await advance(2_000); // 31 s
    visible();
    await flush();
    expect(server.requests).toHaveLength(2);
  });

  it("an online event syncs at once", async () => {
    const { server, engine } = setup();
    engine.start();
    await flush();
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(server.requests).toHaveLength(2);
  });

  it("an empty outbox sends no mutations: the request only pulls", async () => {
    const { server, engine } = setup();
    engine.start();
    await flush();
    await advance(31_000);
    visible();
    await flush();
    expect(server.requests).toHaveLength(2);
    expect(server.requests.every((r) => r.mutations.length === 0)).toBe(true);
  });

  it("does not ask the catalog on every sync, only at start", async () => {
    const { server, engine } = setup();
    engine.start();
    await flush();
    expect(server.catalogRequests).toHaveLength(1);
    await advance(31_000);
    visible();
    window.dispatchEvent(new Event("online"));
    await engine.syncNow("manual");
    await flush();
    expect(server.catalogRequests).toHaveLength(1);
  });
});

describe("during a workout", () => {
  it("still syncs at app start, so a reopened app pushes what was left", async () => {
    const { server, device, flag, engine } = setup();
    flag.active = true;
    await write(device, "left behind");
    engine.start();
    await flush();
    expect(server.requests).toHaveLength(1);
    expect(server.rows("template")).toHaveLength(1);
  });

  it("writes and visibility trigger nothing, and the pending tick syncs once per 5 minutes", async () => {
    const { server, device, setWorkout, engine } = setup();
    engine.start();
    await flush();
    setWorkout(true);
    expect(server.requests).toHaveLength(1);

    await write(device, "set 1");
    await advance(2_000);
    visible();
    await write(device, "set 2");
    await advance(60_000);
    visible();
    await advance(3 * MIN); // 4:02 after the start sync
    expect(server.requests).toHaveLength(1);

    await advance(MIN); // past 5:00: the tick fires one sync
    expect(server.requests).toHaveLength(2);
    expect(server.rows("template")).toHaveLength(2);

    await write(device, "set 3");
    await advance(4 * MIN);
    expect(server.requests).toHaveLength(2); // still inside the next 5 minutes
    await advance(MIN + 30_000);
    expect(server.requests).toHaveLength(3);
    expect(server.rows("template")).toHaveLength(3);
  });

  it("makes no request at all while nothing is pending", async () => {
    const { server, setWorkout, engine } = setup();
    engine.start();
    await flush();
    setWorkout(true);
    await advance(12 * MIN);
    expect(server.requests).toHaveLength(1);
  });

  it("throttles online to the same 5 minutes", async () => {
    const { server, setWorkout, engine } = setup();
    engine.start();
    await flush();
    setWorkout(true);
    await advance(2 * MIN);
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(server.requests).toHaveLength(1);
    await advance(3 * MIN + 5_000);
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(server.requests).toHaveLength(2);
  });

  it("manual sync ignores the throttle", async () => {
    const { server, device, setWorkout, engine } = setup();
    engine.start();
    await flush();
    setWorkout(true);
    await write(device, "a");
    await advance(1_000);
    await engine.syncNow("manual");
    expect(server.requests).toHaveLength(2);
    expect(server.rows("template")).toHaveLength(1);
  });

  it("finishing or discarding (the flag turning off) syncs immediately", async () => {
    const { server, device, setWorkout, engine } = setup();
    engine.start();
    await flush();
    setWorkout(true);
    await write(device, "a");
    await write(device, "b");
    await advance(30_000);
    expect(server.requests).toHaveLength(1);
    setWorkout(false);
    await flush();
    expect(server.requests).toHaveLength(2);
    expect(server.rows("template")).toHaveLength(2);
    expect(await device.db.outbox.count()).toBe(0);
  });

  it("a write made after the workout ends syncs after 1.5 s again", async () => {
    const { server, device, setWorkout, engine } = setup();
    engine.start();
    await flush();
    setWorkout(true);
    setWorkout(false);
    await flush();
    const before = server.requests.length;
    await write(device, "after");
    await advance(2_000);
    expect(server.requests.length).toBe(before + 1);
  });

  it("a manual sync waits for a running one instead of being skipped", async () => {
    const server = new FakeServer();
    const device = newDevice();
    devices.push(device);
    const queue: (() => void)[] = [];
    let held = false;
    const e = createEngine({
      db: device.db,
      fetch: server.fetch as typeof fetch,
      status: createStatusStore(),
      listeners: createSyncedListeners(),
      isWorkoutActive: () => true,
      onWorkoutActiveChange: () => () => undefined,
      locks: {
        request: ((_name: string, options: LockOptions, cb: (lock: Lock | null) => Promise<unknown>) => {
          if (held && options.ifAvailable) return cb(null);
          const run = async () => {
            held = true;
            try {
              return await cb({ name: "x", mode: "exclusive" } as Lock);
            } finally {
              held = false;
              queue.shift()?.();
            }
          };
          if (!held) return run();
          return new Promise<unknown>((resolve) => queue.push(() => void run().then(resolve)));
        }) as unknown as LockManager["request"],
      },
    });
    engine = e;
    const first = e.syncNow("interval");
    const background = await e.syncNow("visibility");
    const manual = e.syncNow("manual");
    expect(background.skipped).toBe(true);
    await first;
    expect((await manual).skipped).toBeUndefined();
    expect(server.requests).toHaveLength(2);
  });
});
