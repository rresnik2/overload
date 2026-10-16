"use client";
// Web vitals for measurement (stream DIAL, PERF-0). Silent unless localStorage["overload:vitals"] === "1" or the URL has ?vitals=1
// (which sets it; remove the key to turn it off). When on, each metric (INP, LCP, CLS, FCP, TTFB, and the soft-navigation
// versions Next reports for client-side route changes) is logged to the console and the last 200 are kept on
// window.__overloadVitals for Playwright (e2e/perf). There is no network beacon.
import { useReportWebVitals } from "next/web-vitals";
import { useSyncExternalStore } from "react";

const KEY = "overload:vitals";
const MAX = 200;

type Metric = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];

export interface VitalsEntry {
  name: string;
  value: number;
  delta: number;
  rating: string;
  id: string;
  navigationType?: string;
  navigationURL?: string;
  /** performance.now() when it was reported. */
  at: number;
}

declare global {
  interface Window {
    __overloadVitals?: VitalsEntry[];
  }
}

function enabled(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get("vitals") === "1") {
      window.localStorage.setItem(KEY, "1");
      return true;
    }
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function report(metric: Metric): void {
  const extra = metric as Metric & { navigationURL?: string };
  const entry: VitalsEntry = {
    name: metric.name,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating,
    id: metric.id,
    navigationType: metric.navigationType,
    navigationURL: extra.navigationURL,
    at: performance.now(),
  };
  const list = (window.__overloadVitals ??= []);
  list.push(entry);
  if (list.length > MAX) list.splice(0, list.length - MAX);
  console.info(`[vitals] ${entry.name} ${Math.round(entry.value * 100) / 100} (${entry.rating}${entry.navigationType ? `, ${entry.navigationType}` : ""})`, entry);
}

/** Mounted only while enabled, so the observers cost nothing otherwise. */
function Reporter() {
  useReportWebVitals(report);
  return null;
}

export function WebVitals() {
  // false on the server and during hydration, then the real flag (no subscription: the flag is read once per page load).
  const on = useSyncExternalStore(
    () => () => undefined,
    enabled,
    () => false,
  );
  return on ? <Reporter /> : null;
}
