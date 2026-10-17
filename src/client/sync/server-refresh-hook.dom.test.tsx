import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncVersionStamp } from "./SyncVersionStamp";
import { useRefreshServerDataOnSync } from "./server-refresh-hook";
import { syncedListeners } from "./status";

const refresh = vi.fn();
let pathname = "/today";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }), usePathname: () => pathname }));

function Host({ version }: { version: number | null }) {
  useRefreshServerDataOnSync();
  return <SyncVersionStamp version={version} />;
}

const synced = (info: { pushed?: number; pulled?: number; serverVersion?: number }) =>
  act(() => syncedListeners.emit({ pushed: 0, pulled: 0, rejected: 0, newPrs: [], ...info }));
const settle = () => act(() => vi.advanceTimersByTimeAsync(500));

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
  pathname = "/today";
  window.history.replaceState(null, "", "/today");
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useRefreshServerDataOnSync with a stamped page", () => {
  it("does not refresh after a fresh load whose start-of-app pull only brings rows the page already shows", async () => {
    const { unmount } = render(<Host version={105} />);
    synced({ pulled: 400, serverVersion: 105 });
    await settle();
    expect(refresh).not.toHaveBeenCalled();
    unmount();
  });

  it("refreshes once when the sync reached a newer server version than the page was rendered at", async () => {
    const { unmount } = render(<Host version={100} />);
    synced({ pulled: 2, serverVersion: 105 });
    synced({ pushed: 1, serverVersion: 106 }); // a burst is coalesced
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("follows the page: a refreshed page carries the newer version, so the next equal sync is quiet", async () => {
    const { rerender, unmount } = render(<Host version={100} />);
    synced({ pushed: 1, serverVersion: 105 });
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
    rerender(<Host version={105} />); // what router.refresh() delivers
    synced({ pulled: 1, serverVersion: 105 });
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("skips the delayed refresh when a newer page arrived during the delay", async () => {
    const { rerender, unmount } = render(<Host version={100} />);
    synced({ pushed: 1, serverVersion: 105 });
    rerender(<Host version={105} />);
    await settle();
    expect(refresh).not.toHaveBeenCalled();
    unmount();
  });

  it("refreshes when the page has no stamp (as before stamps existed)", async () => {
    const { unmount } = render(<Host version={null} />);
    synced({ pulled: 1, serverVersion: 105 });
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("refreshes when the sync reports no version", async () => {
    const { unmount } = render(<Host version={105} />);
    synced({ pulled: 1 });
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("never refreshes the workout screen, but remembers the change for the next server page", async () => {
    pathname = "/workout";
    window.history.replaceState(null, "", "/workout");
    const { rerender, unmount } = render(<Host version={null} />);
    synced({ pushed: 3, serverVersion: 105 });
    await settle();
    expect(refresh).not.toHaveBeenCalled();

    pathname = "/today";
    window.history.replaceState(null, "", "/today");
    rerender(<Host version={90} />); // served from the router cache, rendered before the workout was pushed
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
  });
});
