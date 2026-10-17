import "fake-indexeddb/auto";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAllDbs } from "@/client/db/active";
import { ENGINE_GRACE_MS, SyncProvider } from "./provider";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/today" }));

const emptyChanges = { exercise: [], machineProfile: [], bodyMetric: [], template: [], templateExercise: [], workout: [], workoutExercise: [], workoutSet: [], exerciseFavorite: [] };
const syncResponse = () => Response.json({ results: [], changes: emptyChanges, newPrs: [], cursor: 0, hasMore: false, reset: false, serverTime: new Date().toISOString(), serverHlc: "001791990000000-00000-server" });

let fetchMock: ReturnType<typeof vi.fn>;
const syncRequests = () => fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/api/sync")).length;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => (String(input).endsWith("/api/sync") ? syncResponse() : Response.json({ error: "nope" }, { status: 501 })));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await resetAllDbs();
});

describe("SyncProvider keeps the engine across a hand-over", () => {
  it("a provider that mounts as another unmounts (the (app) and (workout) groups) reuses the running engine: one start sync, not two", async () => {
    const first = render(
      <SyncProvider userId="lease-user">
        <p>app</p>
      </SyncProvider>,
    );
    await waitFor(() => expect(syncRequests()).toBe(1));
    first.unmount(); // the old group's layout goes away...
    const second = render(
      <SyncProvider userId="lease-user">
        <p>workout</p>
      </SyncProvider>,
    ); // ...and the new group's layout arrives in the same navigation
    await new Promise((r) => setTimeout(r, 300));
    expect(syncRequests()).toBe(1);
    second.unmount();
  });

  it("stops the engine once nobody has used it for the grace period, and starts a new one (and a start sync) afterwards", async () => {
    const first = render(
      <SyncProvider userId="lease-user-2">
        <p>app</p>
      </SyncProvider>,
    );
    await waitFor(() => expect(syncRequests()).toBe(1));
    first.unmount();
    await new Promise((r) => setTimeout(r, ENGINE_GRACE_MS + 300));
    const again = render(
      <SyncProvider userId="lease-user-2">
        <p>back</p>
      </SyncProvider>,
    );
    await waitFor(() => expect(syncRequests()).toBe(2));
    again.unmount();
  });
});
