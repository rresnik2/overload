"use client";
// The device's IANA time zone ("" on the server and during hydration, so server and client markup match).
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const detect = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "";

export function useDetectedTimezone(): string {
  return useSyncExternalStore(subscribe, detect, () => "");
}
