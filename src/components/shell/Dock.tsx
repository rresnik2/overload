"use client";
import clsx from "clsx";
import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { DOCK_ITEMS, isActive, MORE_ITEMS, START_WORKOUT } from "./nav";
import { NavIcon } from "./NavIcon";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Mobile bottom dock (daisyUI `dock` as a base-200 panel), above env(safe-area-inset-bottom).
 * Today · Exercises · [Start workout] · Progress · More (Templates, History, Insights, Settings, theme).
 */
export function Dock() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_ITEMS.some((i) => isActive(pathname, i.href));

  const link = (item: (typeof DOCK_ITEMS)[number]) => {
    const active = isActive(pathname, item.href);
    return (
      <Link key={item.href} href={item.href} className={clsx(active && "dock-active")} aria-current={active ? "page" : undefined} transitionTypes={["nav-forward"]}>
        <NavIcon name={item.icon} />
        <span className="dock-label">{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      <nav aria-label="Primary (mobile)" className="dock shell-dock">
        {link(DOCK_ITEMS[0])}
        {link(DOCK_ITEMS[1])}
        <Link href={START_WORKOUT.href} className="shell-dock__start" aria-label={START_WORKOUT.label}>
          <NavIcon name="workout" size={26} />
          <span className="dock-label">Start</span>
        </Link>
        {link(DOCK_ITEMS[2])}
        <button type="button" className={clsx(moreActive && "dock-active")} aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
          <Ellipsis size={22} aria-hidden="true" strokeWidth={1.75} />
          <span className="dock-label">More</span>
        </button>
      </nav>
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <ul className="shell-more">
          {MORE_ITEMS.map((item) => (
            <li key={item.href}>
              <Link href={item.href} onClick={() => setMoreOpen(false)} className="shell-more__link" aria-current={isActive(pathname, item.href) ? "page" : undefined}>
                <NavIcon name={item.icon} />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="shell-more__theme">
          <span>Theme</span>
          <ThemeToggle />
        </div>
      </Sheet>
    </>
  );
}
