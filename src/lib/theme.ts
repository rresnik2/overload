// Theme constants + the inline <head> script that applies the stored theme before first paint. PURE. FROZEN after Phase 0.
// Stored value: "paper" | "ink" | absent (absent = follow prefers-color-scheme; installed PWAs default to ink: the gym default).
export const THEME_STORAGE_KEY = "overload-theme";

// The keys are the stored values from before the Calibrated Dial rename ("paper" = light, "ink" = dark); they stay so
// choices already saved in localStorage keep working. The daisyUI theme names are the new ones.
export const THEME_NAMES = { paper: "overload-daylight", ink: "overload-floor" } as const;
export type ThemeChoice = keyof typeof THEME_NAMES; // stored in localStorage
export type ThemeName = (typeof THEME_NAMES)[ThemeChoice]; // daisyUI data-theme value

/** `<meta name="theme-color">` per theme (matches base-100). */
export const THEME_COLORS = { paper: "#F2F2EF", ink: "#16181A" } as const;

/**
 * Runs synchronously in <head> (the <html> element carries suppressHydrationWarning).
 * Sets data-theme when the user chose one (or the app is installed and has no preference -> ink), and keeps the
 * theme-color meta in sync. Wrapped in try/catch: storage can throw (private mode).
 */
export const themeInitScript = `(function(){try{var d=document.documentElement,k=${JSON.stringify(THEME_STORAGE_KEY)},c=null;try{c=localStorage.getItem(k)}catch(e){}
var standalone=(window.matchMedia&&matchMedia("(display-mode: standalone)").matches)||window.navigator.standalone===true;
if(c!=="paper"&&c!=="ink")c=standalone?"ink":null;
var dark=c?c==="ink":(window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches);
if(c)d.setAttribute("data-theme",c==="ink"?${JSON.stringify(THEME_NAMES.ink)}:${JSON.stringify(THEME_NAMES.paper)});
d.style.colorScheme=dark?"dark":"light";
if(c){var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].setAttribute("content",dark?${JSON.stringify(THEME_COLORS.ink)}:${JSON.stringify(THEME_COLORS.paper)});}
}catch(e){}})();`;

/** Persist a choice (null = back to "follow the system") and apply it immediately. Client-only. */
export function applyTheme(choice: ThemeChoice | null): void {
  try {
    if (choice) localStorage.setItem(THEME_STORAGE_KEY, choice);
    else localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    /* storage unavailable: still apply for this session */
  }
  const root = document.documentElement;
  if (choice) root.setAttribute("data-theme", THEME_NAMES[choice]);
  else root.removeAttribute("data-theme");
  const dark = choice ? choice === "ink" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.style.colorScheme = dark ? "dark" : "light";
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", dark ? THEME_COLORS.ink : THEME_COLORS.paper);
  }
}
