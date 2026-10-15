"use client";
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { applyTheme } from "@/lib/theme";

// The effective theme lives on <html>: data-theme when the user chose one, else prefers-color-scheme.
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  mq.addEventListener("change", cb);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", cb);
  };
};
const isDark = () => {
  const t = document.documentElement.getAttribute("data-theme");
  return t ? t === "overload-ink" : window.matchMedia("(prefers-color-scheme: dark)").matches;
};

/** Flips paper <-> ink and remembers the choice (localStorage via applyTheme). 44px target. */
export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => applyTheme(dark ? "paper" : "ink")}
    >
      {dark ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
    </button>
  );
}
