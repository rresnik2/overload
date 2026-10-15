/**
 * Fixed grayscale photo backdrop (the portfolio's clouds). Marketing, auth and onboarding only: NEVER on logging screens
 * (the workout and the (app) pages stay flat for legibility). Decorative.
 */
export function Backdrop() {
  return <div aria-hidden="true" className="shell-backdrop" />;
}
