// (marketing) layout (stream B): the portfolio look on a fixed grayscale photo backdrop. Shared with /learn/** (stream G).
import Link from "next/link";
import type { ReactNode } from "react";
import { Backdrop } from "@/components/shell/Backdrop";
import { PageTransition } from "@/components/shell/PageTransition";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Backdrop />
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="mkt-header">
        <div className="mkt-frame">
          <Link href="/" className="shell-brand" aria-label="Overload, home">
            Overload
          </Link>
          <nav aria-label="Primary">
            <ul className="mkt-links">
              <li>
                <Link href="/sign-in" className="link-underline tap-target">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href="/sign-up" className="link-underline tap-target">
                  Create account
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} style={{ outline: "none" }}>
        <PageTransition>{children}</PageTransition>
      </main>
      <footer className="mkt-footer">
        <p>Overload is an independent, multi-user training log. Estimates are guidance, not medical advice.</p>
      </footer>
    </>
  );
}
