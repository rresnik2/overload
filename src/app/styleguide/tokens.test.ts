import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHART, COLORS, contrast, EDGE_PAIRS, TEXT_PAIRS, THEME_NAME, type ThemeKey } from "./tokens";

const css = fs.readFileSync(path.resolve(import.meta.dirname, "../../styles/theme.css"), "utf8");

function themeBlock(name: string): string {
  const start = css.indexOf(`name: "${name}"`);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}
function scopeBlock(opener: string): string {
  const start = css.indexOf(opener);
  expect(start, opener).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}
const hexOf = (block: string, token: string) => new RegExp(`--color-${token}:\\s*(#[0-9a-fA-F]{6})`).exec(block)?.[1]?.toLowerCase();

// Custom (non-daisyUI) colour tokens live in per-theme scope blocks, like the chart palette.
const CUSTOM_SCOPE: Record<ThemeKey, string> = {
  paper: ':root,\n[data-theme="overload-daylight"] {\n  --color-muted',
  ink: '[data-theme="overload-floor"] {\n  --color-muted',
};

describe("styleguide token mirror matches theme.css", () => {
  for (const key of ["paper", "ink"] as ThemeKey[]) {
    it(`${key}: every colour token`, () => {
      const daisy = themeBlock(THEME_NAME[key]);
      const custom = scopeBlock(CUSTOM_SCOPE[key]);
      for (const [token, hex] of Object.entries(COLORS[key])) {
        expect(hexOf(daisy, token) ?? hexOf(custom, token), `${key} ${token}`).toBe(hex);
      }
    });
  }

  it("the OS-dark fallback repeats the floor's custom tokens", () => {
    const media = scopeBlock("@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]) {\n    --color-muted");
    for (const token of ["muted", "line-strong", "up", "accent-ink"]) expect(hexOf(media, token), token).toBe(COLORS.ink[token]);
  });

  it("chart variables match for both themes", () => {
    const scopes: Record<ThemeKey, string> = {
      paper: scopeBlock(':root,\n[data-theme="overload-daylight"] {\n  --chart-free-weight'),
      ink: scopeBlock('[data-theme="overload-floor"] {\n  --chart-free-weight'),
    };
    for (const key of ["paper", "ink"] as ThemeKey[]) {
      for (const [name, hex] of Object.entries(CHART[key])) expect(scopes[key], `${key} ${name}`).toContain(`--${name}: ${hex}`);
    }
  });

  it("plate colours are declared once and shared by both themes", () => {
    const plates = { red: "#d8262d", blue: "#2f63d6", yellow: "#efbd2a", green: "#2f9a4f", white: "#ecebe6", black: "#26282a", chrome: "#b9bdc2" };
    for (const [name, hex] of Object.entries(plates)) expect(css, `plate ${name}`).toContain(`--plate-${name}: ${hex}`);
    expect(css).toContain("--steel: #b5babf");
    expect(css).toContain("--steel-dark: #8c9196");
  });

  it("legacy aliases are kept until wave 2 and marked", () => {
    expect(css).toMatch(/LEGACY: removed after wave 2[\s\S]*--shadow-hard: none/);
    expect(css).toContain("--color-vermilion: var(--color-primary)");
    expect(css).toContain("--font-instrument: var(--font-archivo)");
    expect(css).toContain("--font-newsreader: var(--font-archivo)");
  });
});

describe("contrast (WCAG AA) holds in both themes", () => {
  for (const key of ["paper", "ink"] as ThemeKey[]) {
    for (const [fg, bg, min] of TEXT_PAIRS) {
      it(`${key}: ${fg} on ${bg} >= ${min}:1`, () => {
        expect(contrast(COLORS[key][fg]!, COLORS[key][bg]!)).toBeGreaterThanOrEqual(min);
      });
    }
    for (const [edge, bg] of EDGE_PAIRS) {
      it(`${key}: ${edge} on ${bg} >= 3:1 (control edges)`, () => {
        expect(contrast(COLORS[key][edge]!, COLORS[key][bg]!)).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it("chart marks reach 3:1 against the surface (non-text contrast)", () => {
    for (const key of ["paper", "ink"] as ThemeKey[]) {
      for (const [name, hex] of Object.entries(CHART[key])) {
        expect(contrast(hex, COLORS[key]["base-100"]!), `${key} ${name}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
