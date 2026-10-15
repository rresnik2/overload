# E2-1: `primitives.dom.test.tsx` fails lint once `/history` exists (stream B file)

**What.** `src/components/primitives/primitives.dom.test.tsx` line 44:

```diff
-    const { container } = render(<SectionHeader as="h3" title="Recent" actions={<a href="/history">All</a>} />);
+    const { container } = render(<SectionHeader as="h3" title="Recent" actions={<Link href="/history">All</Link>} />);
```
plus `import Link from "next/link";` at the top of the file.

**Why.** `@next/next/no-html-link-for-pages` flags `<a href="/history">` as soon as a `/history` page exists in `src/app`. Stream E2 adds `(app)/history`, so `pnpm lint` (and therefore `pnpm check`) fails on that single line. The file belongs to B / Phase 0 (`src/components/primitives/**`), which E2 may not edit.

**Workaround.** None possible inside E2's paths. Apart from this one error, `pnpm lint` is clean on the E2 branch. The coordinator should apply the diff above when merging E2 (the same rule will trip on `/insights` and `/progress` for G and F if a test uses those hrefs).
