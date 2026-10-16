import { describe, expect, it } from "vitest";
import { decideOnNavigated, decideOnSynced, showsServerData, type ServerDataState } from "./server-refresh";

const changed = { pushed: 1, pulled: 0 };

describe("showsServerData", () => {
  it("is true for the server-rendered sections and their children", () => {
    for (const p of ["/today", "/progress", "/progress/body", "/exercises", "/exercises/abc", "/insights/2026-01-05"]) expect(showsServerData(p)).toBe(true);
  });
  it("is false for Dexie-driven and settings pages, and does not match by prefix alone", () => {
    for (const p of ["/workout", "/history", "/history/abc", "/templates", "/settings/profile", "/todayish", "/"]) expect(showsServerData(p)).toBe(false);
  });
});

describe("decideOnSynced", () => {
  it("ignores a sync that changed nothing", () => {
    const state: ServerDataState = { stale: false };
    expect(decideOnSynced(state, { pushed: 0, pulled: 0 }, "/today")).toBe("none");
    expect(state.stale).toBe(false);
  });
  it("refreshes right away on a server-data page", () => {
    const state: ServerDataState = { stale: true };
    expect(decideOnSynced(state, changed, "/progress")).toBe("refresh");
    expect(state.stale).toBe(false);
  });
  it("only remembers the change while on the workout screen", () => {
    const state: ServerDataState = { stale: false };
    expect(decideOnSynced(state, { pushed: 0, pulled: 2 }, "/workout")).toBe("none");
    expect(state.stale).toBe(true);
  });
});

describe("decideOnNavigated", () => {
  it("refreshes once when a server-data page opens after a change elsewhere (finish a workout, then Today)", () => {
    const state: ServerDataState = { stale: false };
    decideOnSynced(state, changed, "/workout");
    expect(decideOnNavigated(state, "/history")).toBe("none");
    expect(decideOnNavigated(state, "/today")).toBe("refresh");
    expect(decideOnNavigated(state, "/today")).toBe("none");
  });
});
