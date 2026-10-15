"use client";
import { useEffect } from "react";
import { isWorkoutActive } from "@/lib/pwa";

const WARM_URLS = ["/workout", "/today"];

/**
 * Service-worker lifecycle for the signed-in shell (renders nothing).
 *  1. Update flow: the worker is built with skipWaiting:false. Once a new worker is waiting we post {type:"SKIP_WAITING"}
 *     ONLY when no workout is active (isWorkoutActive()), then reload on `controllerchange`. While a workout runs the new
 *     worker simply waits; we re-check when the tab becomes visible, when the flag changes (storage event) and every minute.
 *  2. Warm cache: /workout sits behind auth so it cannot be precached at install time; after sign-in we ask the worker to
 *     cache it (Serwist "CACHE_URLS") so the workout screen opens offline.
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
    const warm = () => {
      if (navigator.onLine && sw.controller) window.serwist?.messageSW({ type: "CACHE_URLS", payload: { urlsToCache: WARM_URLS } });
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
