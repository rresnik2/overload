import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHART, COLORS, contrast, TEXT_PAIRS, THEME_NAME, type ThemeKey } from "./tokens";

const css = fs.readFileSync(path.resolve(import.meta.dirname, "../../styles/theme.css"), "utf8");

function themeBlock(name: string): string {
  const start = css.indexOf(`name: "${name}"`);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}
const hexOf = (block: string, token: string) => new RegExp(`--color-${token}:\\s*(#[0-9a-fA-F]{6})`).exec(block)?.[1]?.toLowerCase();

describe("styleguide token mirror matches theme.css", () => {
  for (const key of ["paper", "ink"] as ThemeKey[]) {
    it(`${key}: every colour token`, () => {
      const block = themeBlock(THEME_NAME[key]);
      for (const [token, hex] of Object.entries(COLORS[key])) expect(hexOf(block, token), `${key} ${token}`).toBe(hex);
    });
  }

  it("chart variables match for both themes", () => {
    const block = (opener: string) => {
      const start = css.indexOf(opener);
      expect(start, opener).toBeGreaterThan(-1);
      return css.slice(start, css.indexOf("}", start));
    };
    const scopes: Record<ThemeKey, string> = {
      paper: block(':root,\n[data-theme="overload-paper"] {\n  --chart-free-weight'),
      ink: block('[data-theme="overload-ink"] {\n  --chart-free-weight'),
    };
    for (const key of ["paper", "ink"] as ThemeKey[]) {
      for (const [name, hex] of Object.entries(CHART[key])) expect(scopes[key], `${key} ${name}`).toContain(`--${name}: ${hex}`);
    }
  });
});

describe("contrast (WCAG AA) holds in both themes", () => {
  for (const key of ["paper", "ink"] as ThemeKey[]) {
    for (const [fg, bg, min] of TEXT_PAIRS) {
      it(`${key}: ${fg} on ${bg} >= ${min}:1`, () => {
        expect(contrast(COLORS[key][fg]!, COLORS[key][bg]!)).toBeGreaterThanOrEqual(min);
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
