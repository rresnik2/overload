import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ARTICLES } from "./articles";
import { SOURCES, source } from "./sources";

describe("/learn sources", () => {
  it("are https, unique, and keyed by their own id", () => {
    const urls = Object.values(SOURCES).map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const [key, s] of Object.entries(SOURCES)) {
      expect(s.id).toBe(key);
      expect(s.url).toMatch(/^https:\/\//);
    }
  });
  it("throws for an unknown source id", () => {
    expect(() => source("nope")).toThrow();
  });
  it("every id an article cites exists, and every cited id is listed in that article's Sources", () => {
    const root = path.resolve(import.meta.dirname, "../../app/(marketing)/learn");
    expect(readdirSync(root).filter((f) => !f.endsWith(".tsx")).sort()).toEqual(ARTICLES.map((a) => a.slug).sort());
    for (const { slug } of ARTICLES) {
      const text = readFileSync(path.join(root, slug, "page.tsx"), "utf8");
      const cited = new Set([...text.matchAll(/<Cite id="([^"]+)"/g)].map((m) => m[1]!));
      const listed = new Set((/<SourceList ids=\{\[([^\]]*)\]\}/.exec(text)?.[1] ?? "").split(",").map((s) => s.trim().replaceAll('"', "")).filter(Boolean));
      for (const id of cited) {
        expect(SOURCES[id], `${slug}: ${id}`).toBeDefined();
        expect(listed.has(id), `${slug}: ${id} cited but not listed`).toBe(true);
      }
    }
  });
});
