"use client";
import { useSyncExternalStore } from "react";
import { Field } from "@/components/auth/Field";

function zones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

const NO_ZONES: string[] = [];
let cachedZones: string[] | undefined;
const subscribeNever = () => () => undefined;
const browserZones = () => (cachedZones ??= zones());
const serverZones = () => NO_ZONES;

/** Free-text IANA zone with suggestions (validated server-side with isValidTimeZone). */
export function TimezoneField({ value, onChange, error, name = "timezone" }: { value: string; onChange: (value: string) => void; error?: string | null; name?: string }) {
  // The list of zones differs between Node and the browser (WebKit names them differently), so hydrate with the empty server snapshot and
  // switch to the browser's list afterwards: a server/client mismatch makes React re-render the whole document, which also drops the
  // theme attribute from <html>.
  const options = useSyncExternalStore(subscribeNever, browserZones, serverZones);
  return (
    <>
      <Field
        label="Time zone"
        name={name}
        type="text"
        list="timezone-options"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        error={error}
        hint="Workouts are grouped by your local date. Detected from your device."
      />
      <datalist id="timezone-options">
        {options.map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>
    </>
  );
}
