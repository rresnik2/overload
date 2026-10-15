import Link from "next/link";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

/** Round avatar with a control-edge ring, linking to settings. Initials when there is no photo. */
export function Avatar({ name, image }: { name: string; image?: string | null }) {
  return (
    <Link href="/settings" className="shell-avatar tap-target" aria-label={`${name}: account settings`}>
      <span className="shell-avatar__disc">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary provider URL, not in next/image remotePatterns
          <img src={image} alt="" width={36} height={36} referrerPolicy="no-referrer" />
        ) : (
          <span aria-hidden="true">{initials(name)}</span>
        )}
      </span>
    </Link>
  );
}
