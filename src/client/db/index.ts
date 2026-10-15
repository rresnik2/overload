// Client database surface (owned by stream E1).
export { activateUserDb, activeDbName, closeUserDb, getActiveDb, openUserDb, requireActiveDb, resetAllDbs, setActiveDb, subscribeActiveDb } from "./active";
export { currentHlc, ensureDeviceId, receiveHlc, tickHlc } from "./clock";
export { META_KEYS, OverloadDb, dbNameFor, getMeta, setMeta, type MetaEntry, type OutboxEntry } from "./schema";
