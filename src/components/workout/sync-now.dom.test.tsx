import "fake-indexeddb/auto";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activateUserDb, requireActiveDb, resetAllDbs } from "@/client/db/active";
import { repo } from "@/client/repo";
import { statusStore } from "@/client/sync/status";
import type { SyncResult } from "@/contracts/sync";

const syncNowMock = vi.fn<(reason?: string) => Promise<SyncResult>>();
vi.mock("@/client/sync", async () => {
  const hooks = await import("@/client/sync/hooks");
  return { useSyncStatus: hooks.useSyncStatus, useOnSynced: hooks.useOnSynced, syncNow: (reason?: string) => syncNowMock(reason) };
});

import { SyncPip } from "@/components/ui/SyncPip";
import { SyncNow, syncNowAnnouncement, syncNowLabel } from "./SyncNow";

const result = (over: Partial<SyncResult> = {}): SyncResult => ({ ok: true, pushed: 0, pulled: 0, rejected: 0, newPrs: [], ...over });

beforeEach(() => {
  activateUserDb("sync-now-user");
  syncNowMock.mockReset();
});
afterEach(async () => {
  statusStore.set({ state: "idle", pendingCount: 0, lastSyncedAt: null, lastError: null, rejectedCount: 0 });
  await resetAllDbs();
});

describe("labels", () => {
  it("says what is waiting, and never relies on colour", () => {
    expect(syncNowLabel({ state: "idle" }, 0)).toBe("Synced");
    expect(syncNowLabel({ state: "idle" }, 3)).toBe("3 unsynced");
    expect(syncNowLabel({ state: "syncing" }, 3)).toBe("Syncing…");
    expect(syncNowLabel({ state: "offline" }, 3)).toBe("Offline, 3 unsynced");
    expect(syncNowLabel({ state: "offline" }, 0)).toBe("Offline");
    expect(syncNowLabel({ state: "error" }, 3)).toBe("Sync failed. Tap to retry");
    expect(syncNowLabel({ state: "signed-out" }, 3)).toBe("Signed out");
  });

  it("tells a screen reader that the sets are safe when the sync did not go through", () => {
    expect(syncNowAnnouncement({ state: "idle" }, 0)).toMatch(/^Synced/);
    expect(syncNowAnnouncement({ state: "offline" }, 2)).toMatch(/saved on this phone/);
    expect(syncNowAnnouncement({ state: "error" }, 2)).toMatch(/saved on this phone.*try again/);
    expect(syncNowAnnouncement({ state: "signed-out" }, 2)).toMatch(/Sign in/);
  });
});

describe("SyncNow", () => {
  it("agrees with the header pip about what is waiting", async () => {
    const template = await repo.templates.create({ name: "a", position: "a0" });
    await repo.templates.update(template.id, { name: "b" });
    render(
      <>
        <SyncPip />
        <SyncNow />
      </>,
    );
    expect(await screen.findByRole("button", { name: "Sync now: 1 unsynced" })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector(".sync-pip")).toHaveTextContent("1 unsynced"));
  });

  it("shows the number of rows with unsent changes, counting a row once however often it changed", async () => {
    const template = await repo.templates.create({ name: "a", position: "a0" });
    await repo.templates.update(template.id, { name: "b" });
    await repo.templates.update(template.id, { name: "c" });
    await repo.templates.create({ name: "d", position: "a1" });
    render(<SyncNow />);
    expect(await screen.findByRole("button", { name: "Sync now: 2 unsynced" })).toBeInTheDocument();
  });

  it("syncs on tap, shows progress, and announces the outcome in a live region", async () => {
    await repo.templates.create({ name: "a", position: "a0" });
    let finish: (r: SyncResult) => void = () => undefined;
    syncNowMock.mockImplementation(
      () =>
        new Promise<SyncResult>((resolve) => {
          statusStore.set({ state: "syncing" });
          finish = resolve;
        }),
    );
    render(<SyncNow />);
    const button = await screen.findByRole("button", { name: "Sync now: 1 unsynced" });
    await userEvent.click(button);
    expect(syncNowMock).toHaveBeenCalledWith("manual");
    expect(await screen.findByRole("button", { name: "Sync now: Syncing…" })).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(screen.getByRole("button", { name: /Sync now/ })); // a second tap while syncing does nothing
    expect(syncNowMock).toHaveBeenCalledTimes(1);

    await requireActiveDb().outbox.clear();
    await act(async () => {
      statusStore.set({ state: "idle" });
      finish(result({ pushed: 1 }));
    });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Synced. Everything is saved to your account."));
    expect(screen.getByRole("button", { name: "Sync now: Synced" })).toBeInTheDocument();
  });

  it("reports a failure without losing the count", async () => {
    await repo.templates.create({ name: "a", position: "a0" });
    syncNowMock.mockImplementation(async () => {
      statusStore.set({ state: "error", lastError: "Sync failed (500)" });
      return result({ ok: false, error: "Sync failed (500)" });
    });
    render(<SyncNow />);
    await userEvent.click(await screen.findByRole("button", { name: /Sync now/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Sync failed. Your sets are saved on this phone."));
    expect(screen.getByRole("button", { name: "Sync now: Sync failed. Tap to retry" })).toBeInTheDocument();
  });

  it("stays quiet until it is tapped", async () => {
    render(<SyncNow />);
    await screen.findByRole("button", { name: "Sync now: Synced" });
    expect(screen.getByRole("status")).toHaveTextContent("");
  });
});
