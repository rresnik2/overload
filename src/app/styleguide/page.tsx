// /styleguide: every token and component, in both themes (each "surface" below pins its own data-theme, so the light and
// dark renderings are on one page for comparison with reece-resnik.vercel.app at 375px and 1280px).
import type { Metadata } from "next";
import { EmptyState } from "@/components/primitives/EmptyState";
import { HardCard } from "@/components/primitives/HardCard";
import { PageHeader } from "@/components/primitives/PageHeader";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Stat } from "@/components/ui/Stat";
import { SyncPipView } from "@/components/ui/SyncPip";
import { ToastProvider } from "@/components/ui/Toast";
import { SYNC_STATES } from "@/contracts/sync";
import { OverlayDemo, StepperDemo, TabsDemo } from "./Demos";
import { PaletteSample } from "./PaletteSample";
import { CHART, COLORS, contrast, TEXT_PAIRS, THEME_NAME, type ThemeKey } from "./tokens";

export const metadata: Metadata = { title: "Styleguide", robots: { index: false } };

const THEMES: { key: ThemeKey; title: string }[] = [
  { key: "paper", title: "Light: overload-daylight" },
  { key: "ink", title: "Dark: overload-floor" },
];

function Swatches({ theme }: { theme: ThemeKey }) {
  return (
    <ul className="sg-swatches">
      {Object.entries(COLORS[theme]).map(([name, hex]) => (
        <li key={name} className="sg-swatch">
          <span className="sg-swatch__chip" style={{ background: `var(--color-${name})` }} aria-hidden="true" />
          <span className="sg-swatch__name">{name}</span>
          <span className="num sg-swatch__hex">{hex.toUpperCase()}</span>
        </li>
      ))}
    </ul>
  );
}

function ContrastTable({ theme }: { theme: ThemeKey }) {
  return (
    <table className="sg-table">
      <caption className="sr-only">Contrast ratios in {THEME_NAME[theme]}</caption>
      <thead>
        <tr>
          <th scope="col">Text</th>
          <th scope="col">On</th>
          <th scope="col">Ratio</th>
          <th scope="col">Needs</th>
        </tr>
      </thead>
      <tbody>
        {TEXT_PAIRS.map(([fg, bg, min]) => {
          const ratio = contrast(COLORS[theme][fg]!, COLORS[theme][bg]!);
          return (
            <tr key={`${fg}-${bg}`}>
              <td>{fg}</td>
              <td>{bg}</td>
              <td className="num">{ratio.toFixed(2)}:1</td>
              <td className="num">
                {min}:1 {ratio >= min ? "✓" : "✗"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Showcase({ theme }: { theme: ThemeKey }) {
  const id = (s: string) => `${theme}-${s}`;
  return (
    <div className="sg-showcase">
      <section className="sg-section">
        <SectionHeader id={id("tokens")} index={1} title="Colour tokens" />
        <Swatches theme={theme} />
        <div className="sg-grid mt-6">
          <ContrastTable theme={theme} />
          <div className="sg-stack">
            <p className="sg-note m-0">
              Plate colours (primary blue, secondary red, accent yellow, success green) appear on plates, lifts and data only, never as decoration. Plate blue is <strong>3.29:1</strong> on the dark floor, so it marks borders and fills but is never small text.
            </p>
            <div className="sg-row">
              <span className="sg-vermilion-box">Hard shadow</span>
              <span className="sg-frame-box">Frame border</span>
            </div>
          </div>
        </div>
      </section>

      <section className="sg-section">
        <SectionHeader id={id("type")} index={2} title="Type" />
        <p className="font-display m-0 text-6xl italic leading-none">Archivo italic</p>
        <p className="m-0 mt-3 text-lg">Archivo body text for everything you read, at least 16px in inputs. Numbers use tabular figures:</p>
        <p className="num m-0 mt-1 text-2xl">0123456789 · 82.5 kg × 8 @ 2 RIR</p>
        <p className="m-0 mt-3">
          A <a className="link-underline tap-target" href="#main">link with the animated vermilion underline</a>.
        </p>
      </section>

      <section className="sg-section">
        <SectionHeader id={id("buttons")} index={3} title="Buttons" />
        <div className="sg-stack">
          {(["primary", "ink", "ghost", "danger"] as const).map((variant) => (
            <div key={variant} className="sg-row">
              <span className="sg-label">{variant}</span>
              <Button variant={variant}>Default</Button>
              <Button variant={variant} loading>
                Loading
              </Button>
              <Button variant={variant} disabled>
                Disabled
              </Button>
            </div>
          ))}
          <div className="sg-row">
            <span className="sg-label">link</span>
            <ButtonLink href="/styleguide">ButtonLink</ButtonLink>
            <Button block className="max-w-xs">
              Block
            </Button>
          </div>
        </div>
      </section>

      <section className="sg-section">
        <SectionHeader id={id("fields")} index={4} title="Fields and steppers" />
        <div className="sg-grid">
          <Field label="Exercise name" placeholder="Back squat" hint="Text, 16px minimum" />
          <Field label="Email" type="email" autoComplete="email" defaultValue="me@example.com" />
          <Field label="Bodyweight" kind="weight" unit="kg" defaultValue="81.4" />
          <Field label="Reps" kind="reps" defaultValue="8" />
          <Field label="Name (error)" error="Name is required" />
          <Field label="Name (disabled)" disabled defaultValue="Locked" />
        </div>
        <div className="mt-6">
          <StepperDemo />
        </div>
      </section>

      <section className="sg-section">
        <SectionHeader id={id("stats")} index={5} title="Stats" />
        <div className="sg-row sg-row--top">
          <Stat label="Weekly sets" value="14" size="sm" />
          <Stat label="Estimated 1RM" value="142.5" unit="kg" size="md" />
          <Stat label="Estimated 1RM" value="142.5" unit="kg" size="lg" pr note="PR on 12 Oct" />
          <Stat label="Loading" value="" size="md" loading />
        </div>
      </section>

      <section className="sg-section">
        <SectionHeader id={id("tabs")} index={6} title="Tabs" />
        <TabsDemo />
      </section>

      <section className="sg-section">
        <SectionHeader id={id("overlays")} index={7} title="Sheet, modal, toast" />
        <OverlayDemo />
      </section>

      <section className="sg-section">
        <SectionHeader id={id("sync")} index={8} title="Sync pip" />
        <div className="sg-row">
          {SYNC_STATES.map((state) => (
            <SyncPipView key={state} state={state} pendingCount={state === "offline" ? 3 : 0} />
          ))}
        </div>
      </section>

      <section className="sg-section">
        <SectionHeader id={id("primitives")} index={9} title="Primitives" />
        <PageHeader as="h2" title="Back squat" meta={["Free weight", "Barbell"]} description="PageHeader with a meta line." actions={<Button variant="ink">Edit</Button>} />
        <div className="sg-grid">
          <HardCard>HardCard (static)</HardCard>
          <HardCard interactive tabIndex={0} role="button" aria-label="Interactive HardCard">
            HardCard interactive: press me
          </HardCard>
        </div>
        <div className="mt-6">
          <EmptyState title="Nothing logged yet" description="Start a workout and your sets will show up here." action={<ButtonLink href="/workout">Start workout</ButtonLink>} />
        </div>
      </section>

      <section className="sg-section">
        <SectionHeader id={id("chart")} index={10} title="Chart palette" />
        <ul className="sg-swatches">
          {Object.entries(CHART[theme]).map(([name, hex]) => (
            <li key={name} className="sg-swatch">
              <span className="sg-swatch__chip" style={{ background: `var(--${name})` }} aria-hidden="true" />
              <span className="sg-swatch__name">{name}</span>
              <span className="num sg-swatch__hex">{hex.toUpperCase()}</span>
            </li>
          ))}
        </ul>
        <PaletteSample />
      </section>
    </div>
  );
}

export default function StyleguidePage() {
  return (
    <ToastProvider>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <main id="main" tabIndex={-1} className="sg-page">
        <PageHeader
          title="Styleguide"
          meta={["Overload", "Design system"]}
          description="Tokens and components, rendered in both themes. The theme toggle switches the page; each section below pins its own theme."
          actions={<ThemeToggle />}
        />
        {THEMES.map(({ key, title }) => (
          <div key={key} data-theme={THEME_NAME[key]} className="sg-surface" aria-label={title} role="region">
            <h2 className="sg-surface__title">{title}</h2>
            <Showcase theme={key} />
          </div>
        ))}
      </main>
    </ToastProvider>
  );
}
