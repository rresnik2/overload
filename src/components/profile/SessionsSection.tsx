"use client";
import { useEffect, useState } from "react";
import { authClient } from "@/client/auth/auth-client";
import { friendlyAuthError } from "@/client/auth/messages";
import { FormAlert } from "@/components/auth/FormAlert";

interface SessionItem {
  id: string;
  token: string;
  createdAt: Date | string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** "Safari on iPhone" style label from a user-agent string (best effort). */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "device";
  return `${browser} on ${os}`;
}

export function SessionsSection({ currentSessionId }: { currentSessionId: string }) {
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    let alive = true;
    void authClient.listSessions().then((result) => {
      if (!alive) return;
      if (result.error) setError(friendlyAuthError(result.error));
      else setSessions(result.data as SessionItem[]);
    });
    return () => {
      alive = false;
    };
  }, [version]);

  async function revoke(token: string) {
    setError(null);
    const result = await authClient.revokeSession({ token });
    if (result.error) setError(friendlyAuthError(result.error));
    reload();
  }
  async function revokeOthers() {
    setError(null);
    const result = await authClient.revokeOtherSessions();
    if (result.error) setError(friendlyAuthError(result.error));
    reload();
  }

  return (
    <div className="settings-form">
      {sessions === null && !error ? <p className="settings-status">Loading sessions…</p> : null}
      {sessions ? (
        <ul className="settings-list" aria-label="Active sessions">
          {sessions.map((s) => (
            <li key={s.id} className="settings-list__item">
              <span>
                {describeUserAgent(s.userAgent)}
                {s.id === currentSessionId ? <strong> · this device</strong> : null}
                <span className="settings-status"> · signed in {new Date(s.createdAt).toLocaleString()}</span>
              </span>
              {s.id !== currentSessionId ? (
                <button type="button" className="btn btn-ghost btn-sm text-error" onClick={() => revoke(s.token)}>
                  Sign out
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
      {sessions && sessions.length > 1 ? (
        <div>
          <button type="button" className="btn btn-outline" onClick={revokeOthers}>
            Sign out all other devices
          </button>
        </div>
      ) : null}
    </div>
  );
}
