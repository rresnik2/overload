// Token mirror for the /styleguide page and its test (tokens.test.ts verifies these against src/styles/theme.css).
// "paper" is the light theme (overload-daylight) and "ink" the dark one (overload-floor): the keys are the values users
// already have stored (src/lib/theme.ts), so they stay.
export type ThemeKey = "paper" | "ink";

export const THEME_NAME: Record<ThemeKey, string> = { paper: "overload-daylight", ink: "overload-floor" };

export const COLORS: Record<ThemeKey, Record<string, string>> = {
  paper: {
    "base-100": "#f2f2ef",
    "base-200": "#e5e5e0",
    "base-300": "#c4c6c0",
    "base-content": "#16181a",
    muted: "#565b62",
    "line-strong": "#80868d",
    primary: "#2556c4",
    "primary-content": "#ffffff",
    secondary: "#c21f26",
    "secondary-content": "#ffffff",
    accent: "#efbd2a",
    "accent-content": "#16181a",
    "accent-ink": "#735200",
    neutral: "#16181a",
    "neutral-content": "#f2f2ef",
    info: "#2556c4",
    "info-content": "#ffffff",
    success: "#1f7a3c",
    "success-content": "#ffffff",
    up: "#1a6e36",
    warning: "#735200",
    "warning-content": "#f2f2ef",
    error: "#b3261e",
    "error-content": "#ffffff",
  },
  ink: {
    "base-100": "#16181a",
    "base-200": "#1f2225",
    "base-300": "#31363b",
    "base-content": "#ecebe6",
    muted: "#a2a8ae",
    "line-strong": "#6b7279",
    primary: "#2f63d6",
    "primary-content": "#ffffff",
    secondary: "#d8262d",
    "secondary-content": "#ffffff",
    accent: "#efbd2a",
    "accent-content": "#16181a",
    "accent-ink": "#efbd2a",
    neutral: "#ecebe6",
    "neutral-content": "#16181a",
    info: "#7d9bff",
    "info-content": "#16181a",
    success: "#2f9a4f",
    "success-content": "#ffffff",
    up: "#62cc80",
    warning: "#efbd2a",
    "warning-content": "#16181a",
    error: "#ff7a6e",
    "error-content": "#16181a",
  },
};

/** Data-viz palette: validated with the dataviz skill on the base-200 panel (see the comment in theme.css). */
export const CHART: Record<ThemeKey, Record<string, string>> = {
  paper: {
    "chart-free-weight": "#2556c4",
    "chart-machine": "#454a50",
    "chart-cable": "#1f7a3c",
    "chart-bodyweight": "#a67c00",
    "chart-forecast": "#6b7279",
    "chart-pr": "#c21f26",
  },
  ink: {
    "chart-free-weight": "#3a6ee0",
    "chart-machine": "#b5babf",
    "chart-cable": "#2f9a4f",
    "chart-bodyweight": "#efbd2a",
    "chart-forecast": "#8c9196",
    "chart-pr": "#ff5a52",
  },
};

/** [text token, background token, minimum WCAG ratio] pairs that must hold in both themes (spec section 03). */
export const TEXT_PAIRS: [string, string, number][] = [
  ["base-content", "base-100", 7],
  ["base-content", "base-200", 7],
  ["muted", "base-100", 4.5],
  ["muted", "base-200", 4.5],
  ["primary-content", "primary", 4.5],
  ["secondary-content", "secondary", 4.5],
  ["accent-content", "accent", 4.5],
  ["neutral-content", "neutral", 4.5],
  ["info-content", "info", 4.5],
  ["warning-content", "warning", 4.5],
  ["error-content", "error", 4.5],
  // Success green with white text is 3.59:1 on the floor: large or bold (19 px+) only, so it is checked at 3:1.
  ["success-content", "success", 3],
  // semantic colours used as TEXT on the page surface (field errors, sync pip, toasts, deltas)
  ["error", "base-100", 4.5],
  ["warning", "base-100", 4.5],
  ["info", "base-100", 4.5],
  ["success", "base-100", 4.5],
  ["up", "base-200", 4.5],
  ["accent-ink", "base-100", 4.5],
  ["accent-ink", "base-200", 4.5],
];

/** Pairs that mark a control's edge or an icon: non-text contrast of at least 3:1. */
export const EDGE_PAIRS: [string, string][] = [["line-strong", "base-100"]];

const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  return 0.2126 * channel(((n >> 16) & 255) / 255) + 0.7152 * channel(((n >> 8) & 255) / 255) + 0.0722 * channel((n & 255) / 255);
}
/** WCAG 2.x contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
