"use client";
import { useMemo } from "react";
import { Field } from "@/components/auth/Field";

function zones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

/** Free-text IANA zone with suggestions (validated server-side with isValidTimeZone). */
export function TimezoneField({ value, onChange, error, name = "timezone" }: { value: string; onChange: (value: string) => void; error?: string | null; name?: string }) {
  const options = useMemo(() => zones(), []);
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
