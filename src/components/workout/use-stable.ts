"use client";
import { useState } from "react";
import { replaceEqualDeep } from "@/lib/structural";

/**
 * `value`, but with every part that is deeply equal to the previous render's value kept as the SAME reference. A database re-read
 * returns fresh objects for rows that did not change; passed through here they keep their identity, so `memo` components below
 * skip rendering. Uses React's "adjust state while rendering" pattern (the store is only touched when something changed).
 */
export function useStable<T>(value: T): T {
  const [kept, setKept] = useState(value);
  const next = replaceEqualDeep(kept, value);
  if (next !== kept) setKept(next);
  return next;
}
