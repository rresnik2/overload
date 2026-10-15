"use client";
import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, NAV_ITEMS } from "./nav";

/** Desktop link row: vermilion underline animates in on hover and stays for the current page (aria-current). */
export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="shell-nav">
      <ul className="shell-nav__list">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link href={item.href} className={clsx("link-underline tap-target", active && "is-active")} aria-current={active ? "page" : undefined} transitionTypes={["nav-forward"]}>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
