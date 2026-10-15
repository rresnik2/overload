# F-1: mobile dock active label fails WCAG AA contrast on the paper theme (stream B file)

## What
`src/styles/shell.css` (stream B), around line 248:

```css
.shell-dock .dock-active {
  color: var(--color-vermilion);          /* small 0.72rem label text: 3.7:1 on #F4F2ED */
}
```
becomes
```css
.shell-dock .dock-active {
  color: var(--color-base-content);       /* keep the vermilion bar (::after) and icon as the active cue */
}
.shell-dock .dock-active .dock-label {
  color: var(--color-base-content);
}
```
(or use `--color-primary`, `#C8321F`, which is 4.8:1 on paper).

## Why
CLAUDE.md: vermilion is never for small body text (3.7:1 on paper). axe reports `color-contrast` on `.dock-active > .dock-label`
for the WebKit iPhone project in the paper theme (seen on `/progress`, whose nav item is the active one):
`e2e/progress.spec.ts` "axe: progress pages have no violations in the paper theme [webkit-iphone]". It affects every page whose
nav item is in the dock (Today, Exercises, Progress) and is not specific to stream F.

## Workaround
`e2e/progress.spec.ts` excludes `.shell-dock` from its axe runs (the shell is covered by `e2e/shell.spec.ts`); the charts and pages
themselves are scanned in full.
