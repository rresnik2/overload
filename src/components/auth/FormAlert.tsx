import type { ReactNode } from "react";

export function FormAlert({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: ReactNode }) {
  const tone = kind === "error" ? "alert-error" : kind === "success" ? "alert-success" : "alert-info";
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`alert alert-soft ${tone}`}>
      <span>{children}</span>
    </div>
  );
}
