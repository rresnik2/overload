import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";

// Route skeletons for the signed-in app (the loading.tsx of each section). A tap on the dock shows one at once while the
// server renders the page. Rules that keep the swap to real content from moving anything:
//   - the page title is the real title (it is known statically) in the same type as the real header, but a <p>, not a heading,
//     so a test or a screen reader waiting for the page heading still waits for the page;
//   - every placeholder block has a fixed height set from CSS (--skel-h, tuned per breakpoint in shell.css), not content;
//   - the shimmer animates only a background gradient, and only when the person has not asked for reduced motion.

type SkelVars = CSSProperties & { "--skel-h"?: string; "--skel-lines"?: number; "--skel-lines-wide"?: number };

/** Wrapper: one polite status for assistive technology, everything drawn inside is hidden from it. */
export function SkeletonPage({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={clsx("skel-page", className)} role="status" aria-busy="true">
      <span className="sr-only">Loading {label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

/** A shimmering block. `h` is any CSS length; use the `size` classes in shell.css when it differs by breakpoint. */
export function Skel({ h, className }: { h?: string; className?: string }) {
  const style: SkelVars | undefined = h ? { "--skel-h": h } : undefined;
  return <div className={clsx("skel", className)} style={style} />;
}

/**
 * Same markup and classes as PageHeader, with a fixed-height description block in place of the text. `lines` is the description
 * length on a phone, `linesWide` from 768 px up (the real text wraps less on wide screens).
 */
export function SkeletonHeader({ title, meta, lines = 2, linesWide = lines, action }: { title: string; meta?: string; lines?: number; linesWide?: number; action?: boolean }) {
  const style: SkelVars = { "--skel-lines": lines, "--skel-lines-wide": linesWide };
  return (
    <header className="page-header">
      <div>
        {meta ? <p className="meta-line">{meta}</p> : null}
        <p className="page-header__title">{title}</p>
        <div className="skel-desc" style={style} />
      </div>
      {action ? <div className="skel skel--action" /> : null}
    </header>
  );
}

/** A column of equal rows (lists of exercises, workouts, templates). */
export function SkeletonRows({ count, h = "var(--skel-row-h)" }: { count: number; h?: string }) {
  return (
    <div className="skel-rows">
      {Array.from({ length: count }, (_, i) => (
        <Skel key={i} h={h} />
      ))}
    </div>
  );
}
