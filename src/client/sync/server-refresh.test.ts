import { describe, expect, it } from "vitest";
import { decideOnNavigated, decideOnSynced, pageIsCurrent, showsServerData, type ServerDataState } from "./server-refresh";

const pushed = { pushed: 1, pulled: 0, serverVersion: 105 };

describe("showsServerData", () => {
  it("is true for the server-rendered sections and their children", () => {
    for (const p of ["/today", "/progress", "/progress/body", "/exercises", "/exercises/abc", "/insights/2026-01-05"]) expect(showsServerData(p)).toBe(true);
  });
  it("is false for Dexie-driven and settings pages, and does not match by prefix alone", () => {
    for (const p of ["/workout", "/history", "/history/abc", "/templates", "/settings/profile", "/todayish", "/"]) expect(showsServerData(p)).toBe(false);
  });
});

describe("pageIsCurrent", () => {
  it("is true only when the page version is known and not behind the server version", () => {
    expect(pageIsCurrent(105, 105)).toBe(true);
    expect(pageIsCurrent(106, 105)).toBe(true);
    expect(pageIsCurrent(104, 105)).toBe(false);
    expect(pageIsCurrent(0, 0)).toBe(true); // a user with nothing synced yet
  });
  it("refreshes when either side is unknown (correctness over savings)", () => {
    expect(pageIsCurrent(null, 105)).toBe(false);
    expect(pageIsCurrent(105, null)).toBe(false);
    expect(pageIsCurrent(105, undefined)).toBe(false);
    expect(pageIsCurrent(undefined, undefined)).toBe(false);
  });
});

describe("decideOnSynced", () => {
  it("ignores a sync that changed nothing", () => {
    const state: ServerDataState = { stale: false };
    expect(decideOnSynced(state, { pushed: 0, pulled: 0, serverVersion: 9 }, "/today", 1)).toBe("none");
    expect(state.stale).toBe(false);
  });

  it("refreshes a server-data page that was rendered before the version the sync caught up to", () => {
    const state: ServerDataState = { stale: true };
    expect(decideOnSynced(state, pushed, "/progress", 100)).toBe("refresh");
    expect(state.stale).toBe(false);
    expect(state.serverVersion).toBe(105);
  });

  it("skips the refresh when the page was rendered at or after that version (the start-of-app pull of rows the page already shows)", () => {
    const state: ServerDataState = { stale: false };
    expect(decideOnSynced(state, { pushed: 0, pulled: 312, serverVersion: 105 }, "/today", 105)).toBe("none");
    expect(decideOnSynced(state, { pushed: 0, pulled: 1, serverVersion: 105 }, "/today", 110)).toBe("none");
  });

  it("skips it for a push that landed before the page was fetched, and clears an older stale mark", () => {
    const state: ServerDataState = { stale: true };
    expect(decideOnSynced(state, pushed, "/today", 105)).toBe("none");
    expect(state.stale).toBe(false);
  });

  it("refreshes when the page has no version yet (no stamp, or still a skeleton)", () => {
    expect(decideOnSynced({ stale: false }, pushed, "/today", null)).toBe("refresh");
    expect(decideOnSynced({ stale: false }, pushed, "/today")).toBe("refresh");
  });

  it("refreshes when the sync did not say which version it reached", () => {
    expect(decideOnSynced({ stale: false }, { pushed: 1, pulled: 0 }, "/today", 105)).toBe("refresh");
    expect(decideOnSynced({ stale: false }, { pushed: 1, pulled: 0, serverVersion: undefined }, "/today", 105)).toBe("refresh");
  });

  it("only remembers the change while on the workout screen", () => {
    const state: ServerDataState = { stale: false };
    expect(decideOnSynced(state, { pushed: 0, pulled: 2, serverVersion: 105 }, "/workout", 100)).toBe("none");
    expect(state.stale).toBe(true);
    expect(state.serverVersion).toBe(105);
  });

  it("keeps the newest version the syncs reached", () => {
    const state: ServerDataState = { stale: false };
    decideOnSynced(state, { pushed: 1, pulled: 0, serverVersion: 105 }, "/workout");
    decideOnSynced(state, { pushed: 0, pulled: 3, serverVersion: 109 }, "/workout");
    expect(state.serverVersion).toBe(109);
    // a later sync that does not report a version makes the stored one unknown rather than leaving an out-of-date number
    decideOnSynced(state, { pushed: 0, pulled: 1 }, "/workout");
    expect(state.serverVersion).toBeNull();
  });
});

describe("decideOnNavigated", () => {
  it("refreshes once when a server-data page opens after a change elsewhere (finish a workout, then Today)", () => {
    const state: ServerDataState = { stale: false };
    decideOnSynced(state, pushed, "/workout");
    expect(decideOnNavigated(state, "/history")).toBe("none");
    expect(decideOnNavigated(state, "/today")).toBe("refresh");
    expect(decideOnNavigated(state, "/today")).toBe("none");
  });

  it("refreshes a page that came from the router cache, rendered before the change", () => {
    const state: ServerDataState = { stale: false };
    decideOnSynced(state, pushed, "/workout");
    expect(decideOnNavigated(state, "/today", 100)).toBe("refresh");
  });

  it("does not refresh a page that was fetched after the change", () => {
    const state: ServerDataState = { stale: false };
    decideOnSynced(state, pushed, "/workout");
    expect(decideOnNavigated(state, "/today", 105)).toBe("none");
    expect(state.stale).toBe(false);
    expect(decideOnNavigated(state, "/progress", 90)).toBe("none"); // the mark is spent: nothing more to refresh for
  });

  it("does nothing when nothing changed", () => {
    expect(decideOnNavigated({ stale: false }, "/today", 1)).toBe("none");
  });
});
