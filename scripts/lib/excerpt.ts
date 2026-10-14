// Pulls declarations out of source files so docs (CONTRACTS.md, docs/agents/*.md) quote the REAL signatures.
// Doc syntax:   <!-- sig: src/contracts/analytics.ts#Estimate1RM,E1rmInput -->
//               ```ts
//               (generated: do not edit; run `pnpm docs:sync`)
//               ```
// Append `!` to a name to take only its signature (functions: up to the body).   e.g. applyServerMutations!
export interface DocBlock {
  path: string;
  names: string[];
}

const DECL = (name: string) =>
  new RegExp(`^(?:export\\s+)?(?:declare\\s+)?(?:async\\s+)?(type|interface|const|let|function|class)\\s+${name}\\b`, "m");

/** Index just past the end of the declaration that starts at `start` (handles strings, comments, nesting). */
function declarationEnd(src: string, start: number, kind: string, signatureOnly: boolean): number {
  let depth = 0;
  let i = start;
  let sawBraceBody = false;
  while (i < src.length) {
    const c = src[i] as string;
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      i = src.indexOf("\n", i);
      if (i === -1) return src.length;
      continue;
    }
    if (c === "/" && n === "*") {
      i = src.indexOf("*/", i + 2) + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      i += 1;
      while (i < src.length && src[i] !== c) i += src[i] === "\\" ? 2 : 1;
      i += 1;
      continue;
    }
    if (c === "{" && depth === 0 && signatureOnly && (kind === "function" || kind === "const")) return i;
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") {
      depth -= 1;
      if (c === "}" && depth === 0 && (kind === "interface" || kind === "class" || kind === "function")) sawBraceBody = true;
    }
    if (depth === 0 && (kind === "interface" || kind === "class" || kind === "function") && sawBraceBody) return i + 1;
    if (depth === 0 && c === ";" && (kind === "type" || kind === "const" || kind === "let")) return i + 1;
    i += 1;
  }
  return src.length;
}

export function extractDecl(source: string, rawName: string): string {
  const signatureOnly = rawName.endsWith("!");
  const name = rawName.replace(/!$/, "");
  const match = DECL(name).exec(source);
  if (!match) throw new Error(`declaration not found: ${name}`);
  // include the contiguous comment block directly above
  const before = source.slice(0, match.index).split("\n");
  before.pop();
  const comment: string[] = [];
  while (before.length > 0) {
    const line = before[before.length - 1] as string;
    if (/^\s*(\/\/|\/\*\*|\*|\*\/)/.test(line)) comment.unshift(before.pop() as string);
    else break;
  }
  const end = declarationEnd(source, match.index, match[1] as string, signatureOnly);
  let text = source.slice(match.index, end).trimEnd();
  if (signatureOnly) text = `${text.replace(/\s+$/, "")};`;
  return [...comment, text].join("\n");
}

const BLOCK = /<!-- sig: ([^#\s]+)#([^>]+?) -->\n```ts\n[\s\S]*?\n```/g;

/** Rewrite every sig block in a markdown file; returns the new text. `read` supplies source file contents. */
export function syncDoc(markdown: string, read: (path: string) => string): string {
  return markdown.replace(BLOCK, (_all, path: string, names: string) => {
    const source = read(path);
    const body = names
      .split(",")
      .map((n) => extractDecl(source, n.trim()))
      .join("\n\n");
    return `<!-- sig: ${path}#${names} -->\n\`\`\`ts\n// from ${path}\n${body}\n\`\`\``;
  });
}
