import type { ReactNode } from "react";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="auth-backdrop" aria-hidden="true" />
      {children}
    </>
  );
}
