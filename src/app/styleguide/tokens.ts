// Token mirror for the /styleguide page and its test (tokens.test.ts verifies these against src/styles/theme.css).
export type ThemeKey = "paper" | "ink";

export const THEME_NAME: Record<ThemeKey, string> = { paper: "overload-paper", ink: "overload-ink" };

export const COLORS: Record<ThemeKey, Record<string, string>> = {
  paper: {
    "base-100": "#f4f2ed",
    "base-200": "#eae7df",
    "base-300": "#dcd8ce",
    "base-content": "#141414",
    primary: "#c8321f",
    "primary-content": "#f4f2ed",
    secondary: "#3d6b9e",
    "secondary-content": "#f4f2ed",
    accent: "#8a5a00",
    "accent-content": "#f4f2ed",
    neutral: "#141414",
    "neutral-content": "#f4f2ed",
    info: "#2f5d8a",
    "info-content": "#f4f2ed",
    success: "#2f6b3f",
    "success-content": "#f4f2ed",
    warning: "#8a5a00",
    "warning-content": "#f4f2ed",
    error: "#b3261e",
    "error-content": "#f4f2ed",
    vermilion: "#e4402b",
  },
  ink: {
    "base-100": "#1c1b19",
    "base-200": "#232220",
    "base-300": "#2e2c29",
    "base-content": "#edeae3",
    primary: "#f26a55",
    "primary-content": "#141414",
    secondary: "#6fa3dc",
    "secondary-content": "#141414",
    accent: "#e0a94a",
    "accent-content": "#141414",
    neutral: "#edeae3",
    "neutral-content": "#141414",
    info: "#8fb8e8",
    "info-content": "#141414",
    success: "#8ccb98",
    "success-content": "#141414",
    warning: "#e8b84f",
    "warning-content": "#141414",
    error: "#ff8f85",
    "error-content": "#141414",
    vermilion: "#f26a55",
  },
};

/** Data-viz palette (validated with the dataviz skill; see theme.css). */
export const CHART: Record<ThemeKey, Record<string, string>> = {
  paper: {
    "chart-free-weight": "#e4402b",
    "chart-machine": "#555350",
    "chart-cable": "#4a7fb8",
    "chart-bodyweight": "#a8730a",
    "chart-forecast": "#6b6862",
    "chart-pr": "#e4402b",
  },
  ink: {
    "chart-free-weight": "#e8573f",
    "chart-machine": "#8a867f",
    "chart-cable": "#4f8fe0",
    "chart-bodyweight": "#c28410",
    "chart-forecast": "#a8a49a",
    "chart-pr": "#f26a55",
  },
};

/** [text token, background token, minimum WCAG ratio] pairs that must hold in both themes. */
export const TEXT_PAIRS: [string, string, number][] = [
  ["base-content", "base-100", 7],
  ["base-content", "base-200", 7],
  ["primary-content", "primary", 4.5],
  ["secondary-content", "secondary", 4.5],
  ["accent-content", "accent", 4.5],
  ["neutral-content", "neutral", 4.5],
  ["info-content", "info", 4.5],
  ["success-content", "success", 4.5],
  ["warning-content", "warning", 4.5],
  ["error-content", "error", 4.5],
  // semantic colours used as TEXT on the page surface (field errors, sync pip, toasts)
  ["error", "base-100", 4.5],
  ["warning", "base-100", 4.5],
  ["info", "base-100", 4.5],
  ["success", "base-100", 4.5],
];

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
