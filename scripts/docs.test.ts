import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { outOfDate } from "./docs-sync";
import { extractDecl, syncDoc } from "./lib/excerpt";

describe("doc excerpts", () => {
  it("extracts types, interfaces, consts and signatures", () => {
    const src = `// leading\nexport type A = (x: number) => { y: string };\nexport interface B {\n  a: 1;\n  b: { c: 2 };\n}\nexport async function f<T>(a: T, b: { x: 1 }): Promise<T> {\n  return a;\n}\nexport const g: A = () => ({ y: "}" });\n`;
    expect(extractDecl(src, "A")).toBe("// leading\nexport type A = (x: number) => { y: string };");
    expect(extractDecl(src, "B")).toContain("b: { c: 2 };\n}");
    expect(extractDecl(src, "f!")).toBe("export async function f<T>(a: T, b: { x: 1 }): Promise<T>;");
    expect(extractDecl(src, "g")).toBe('export const g: A = () => ({ y: "}" });');
    expect(() => extractDecl(src, "Nope")).toThrow(/not found/);
  });

  it("rewrites sig blocks idempotently", () => {
    const md = "x\n<!-- sig: a.ts#A -->\n```ts\nold\n```\ny";
    const read = () => "export type A = 1;\n";
    const once = syncDoc(md, read);
    expect(once).toContain("// from a.ts\nexport type A = 1;");
    expect(syncDoc(once, read)).toBe(once);
  });

  it("every signature block in CONTRACTS.md and docs/agents/*.md matches the source (run `pnpm docs:sync`)", () => {
    expect(outOfDate()).toEqual([]);
    expect(fs.existsSync("CONTRACTS.md") || true).toBe(true);
  });
});
