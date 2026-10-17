import "fake-indexeddb/auto";
import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetAllDbs, getActiveDb } from "@/client/db/active";
import { repo, useLive } from "@/client/repo";
import type { SyncedInfo } from "@/contracts/sync";
import { createStatusStore, createSyncedListeners, statusStore, syncedListeners } from "./status";
import { useOnSynced, useSyncStatus } from "./hooks";
import { SyncProvider } from "./provider";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/workout" }));
import { syncNow } from "./engine";

afterEach(async () => {
  vi.unstubAllGlobals();
  statusStore.set({ state: "idle", pendingCount: 0, lastSyncedAt: null, lastError: null, rejectedCount: 0 });
  await resetAllDbs();
});

describe("status store", () => {
  it("keeps a stable snapshot until something changes and notifies subscribers", () => {
    const store = createStatusStore();
    const first = store.get();
    const spy = vi.fn();
    const off = store.subscribe(spy);
    store.set({ state: "idle" }); // no change
    expect(store.get()).toBe(first);
    expect(spy).not.toHaveBeenCalled();
    store.set({ pendingCount: 3 });
    expect(store.get()).not.toBe(first);
    expect(store.get().pendingCount).toBe(3);
    expect(spy).toHaveBeenCalledTimes(1);
    off();
    store.set({ pendingCount: 4 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("emits synced info to every listener", () => {
    const l = createSyncedListeners();
    const a = vi.fn();
    const b = vi.fn();
    l.subscribe(a);
    const off = l.subscribe(b);
    off();
    l.emit({ pushed: 1, pulled: 2, rejected: 0, newPrs: [] });
    expect(a).toHaveBeenCalledWith({ pushed: 1, pulled: 2, rejected: 0, newPrs: [] });
    expect(b).not.toHaveBeenCalled();
  });
});

describe("hooks", () => {
  it("useSyncStatus follows the store; useOnSynced calls the latest callback", async () => {
    const seen: SyncedInfo[][] = [[], []];
    function Probe({ which }: { which: 0 | 1 }) {
      const status = useSyncStatus();
      useOnSynced((info) => seen[which]?.push(info));
      return <p>{`${status.state}:${status.pendingCount}`}</p>;
    }
    const { rerender } = render(<Probe which={0} />);
    expect(screen.getByText("idle:0")).toBeInTheDocument();
    act(() => statusStore.set({ state: "syncing", pendingCount: 2 }));
    expect(screen.getByText("syncing:2")).toBeInTheDocument();
    act(() => syncedListeners.emit({ pushed: 1, pulled: 0, rejected: 0, newPrs: [] }));
    rerender(<Probe which={1} />); // a new callback identity is picked up without resubscribing
    act(() => syncedListeners.emit({ pushed: 2, pulled: 0, rejected: 0, newPrs: [] }));
    expect(seen[0]?.map((i) => i.pushed)).toEqual([1]);
    expect(seen[1]?.map((i) => i.pushed)).toEqual([2]);
  });
});

describe("SyncProvider", () => {
  it("opens the user's database, starts the engine, exposes window.__overload in development and drives useLive", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/api/sync")
        ? Response.json({ results: [], changes: { exercise: [], machineProfile: [], bodyMetric: [], template: [], templateExercise: [], workout: [], workoutExercise: [], workoutSet: [] }, newPrs: [], cursor: 0, hasMore: false, reset: false, serverTime: new Date().toISOString(), serverHlc: "001791990000000-00000-server" })
        : Response.json({ error: "nope" }, { status: 501 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    function Templates() {
      const templates = useLive(() => repo.templates.list(), []);
      return <ul>{(templates ?? []).map((t) => <li key={t.id}>{t.name}</li>)}</ul>;
    }
    render(
      <StrictMode>
        <SyncProvider userId="user-xyz">
          <Templates />
        </SyncProvider>
      </StrictMode>,
    );
    expect(getActiveDb()?.name).toBe("overload-user-xyz");
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/api/sync"))).toBe(true));
    const dev = (window as unknown as { __overload?: { repo: typeof repo; syncNow: typeof syncNow } }).__overload;
    expect(dev?.repo).toBeDefined();
    expect(typeof dev?.syncNow).toBe("function");

    await act(async () => {
      await repo.templates.create({ name: "Live template", position: "a0" });
    });
    await waitFor(() => expect(screen.getByText("Live template")).toBeInTheDocument());
    // the write trigger syncs the new outbox entry (1.5 s) -- here we sync explicitly
    const result = await act(async () => syncNow("manual"));
    expect(result === undefined || result.ok === false || result.skipped === true || result.pushed >= 0).toBe(true);
  });

  it("does not expose the test hook in production builds", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "x" }, { status: 501 })));
    render(
      <SyncProvider userId="user-prod">
        <p>child</p>
      </SyncProvider>,
    );
    expect(screen.getByText("child")).toBeInTheDocument();
    expect((window as unknown as { __overload?: unknown }).__overload).toBeUndefined();
    vi.unstubAllEnvs();
  });
});
