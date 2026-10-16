"use client";
import { useLinkStatus } from "next/link";

/**
 * Pending indicator for a navigation link: a thin bar that fades in while the tapped link's route is still loading (its
 * prefetch has not finished, or the server is still answering). Render it as a child of the <Link>; useLinkStatus reads the
 * nearest link. It is always in the DOM at a fixed size and only changes opacity, so it never moves the layout. Decorative:
 * the destination's loading.tsx announces the loading state to assistive technology.
 */
export function LinkPending({ placement = "top" }: { placement?: "top" | "bottom" }) {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" className="link-pending" data-placement={placement} data-pending={pending ? "true" : undefined} />;
}
