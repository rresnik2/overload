"use client";
import { useEffect } from "react";
import { isWorkoutActive } from "@/lib/pwa";

const WARM_URLS = ["/workout", "/today"];
const WARMED_KEY = "overload:sw-warmed";
/** Shared by every PwaClient mount in this page (the (app) and (workout) groups each render one). */
let warming = false;

const readWarmedVersion = (): string | null => {
  try {
    return localStorage.getItem(WARMED_KEY);
  } catch {
    return null;
  }
};
const writeWarmedVersion = (version: string): void => {
  try {
    localStorage.setItem(WARMED_KEY, version);
  } catch {
    /* storage unavailable: it will warm again next time */
  }
};

/** Ask the controlling worker which build it is (src/app/sw.ts answers GET_VERSION on a MessageChannel). null if it does not answer. */
function workerVersion(worker: ServiceWorker | null): Promise<string | null> {
  if (!worker) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), 2_000);
    channel.port1.onmessage = (event: MessageEvent) => {
      window.clearTimeout(timer);
      resolve(typeof event.data === "string" ? event.data : null);
    };
    worker.postMessage({ type: "GET_VERSION" }, [channel.port2]);
  });
}

/**
 * Service-worker lifecycle for the signed-in shell (renders nothing).
 *  1. Update flow: the worker is built with skipWaiting:false. Once a new worker is waiting we post {type:"SKIP_WAITING"}
 *     ONLY when no workout is active (isWorkoutActive()), then reload on `controllerchange`. While a workout runs the new
 *     worker simply waits; we re-check when the tab becomes visible, when the flag changes (storage event) and every minute.
 *  2. Warm cache: /workout sits behind auth so it cannot be precached at install time; after sign-in we ask the worker to
 *     cache it (Serwist "CACHE_URLS") so the workout screen opens offline. Once per worker version, in idle time.
 */
export function PwaClient() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    const hadController = Boolean(sw.controller);
    let reloading = false;

    const activateIfIdle = async () => {
      const reg = await sw.getRegistration();
      if (reg?.waiting && !isWorkoutActive()) reg.waiting.postMessage({ type: "SKIP_WAITING" });
    };
    // Fetching /workout and /today renders both on the server, so do it once per service-worker version, when the browser is idle,
    // and again only if the cache lost them (not on every layout mount).
    const warm = () => {
      if (warming || !navigator.onLine || !sw.controller) return;
      warming = true;
      const run = async () => {
        try {
          const version = await workerVersion(sw.controller);
          const cached = typeof caches === "undefined" ? false : Boolean(await caches.match(WARM_URLS[0] as string));
          if (cached && version && readWarmedVersion() === version) return;
          window.serwist?.messageSW({ type: "CACHE_URLS", payload: { urlsToCache: WARM_URLS } });
          if (version) writeWarmedVersion(version);
        } finally {
          warming = false;
        }
      };
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(() => void run(), { timeout: 10_000 });
      else window.setTimeout(() => void run(), 4_000);
    };
    const onControllerChange = () => {
      // First install also fires controllerchange (clientsClaim): only reload for a real update, and never mid-workout.
      if (!hadController || reloading || isWorkoutActive()) return;
      reloading = true;
      window.location.reload();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void activateIfIdle();
    };
    const watchInstalling = (reg: ServiceWorkerRegistration) => {
      reg.addEventListener("updatefound", () => {
        reg.installing?.addEventListener("statechange", () => void activateIfIdle());
      });
    };

    sw.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", activateIfIdle);
    window.addEventListener("online", warm);
    const interval = window.setInterval(() => void activateIfIdle(), 60_000);

    void sw.ready.then((reg) => {
      watchInstalling(reg);
      void activateIfIdle();
      warm();
    });

    return () => {
      sw.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", activateIfIdle);
      window.removeEventListener("online", warm);
      window.clearInterval(interval);
    };
  }, []);
  return null;
}
