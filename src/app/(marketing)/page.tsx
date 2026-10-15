// Landing page (stream B). Server Component. Copy describes what the app does today; the stat card is labelled example data.
import { HardCard } from "@/components/primitives/HardCard";
import { PageHeader } from "@/components/primitives/PageHeader";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Stat } from "@/components/ui/Stat";

const FEATURES = [
  {
    title: "Log a set in seconds",
    body: "Weight, reps and reps in reserve for every set, with last time's numbers shown as a hint. A rest timer that keeps counting if you lock your phone.",
  },
  {
    title: "Works with no signal",
    body: "Everything saves on your phone first and syncs when you are back online. Add it to your iPhone home screen and the workout screen opens offline.",
  },
  {
    title: "See progress, with a forecast",
    body: "Estimated one-rep max, weekly sets per muscle and personal records. The forecast shows a range, and tells you when there is not enough data to draw one.",
  },
  {
    title: "Machines are not barbells",
    body: "A catalog that separates free weights, machines, cables and bodyweight, so a leg press at your gym is tracked as that machine and compared with itself.",
  },
] as const;

export default function LandingPage() {
  return (
    <>
      <p className="mkt-hello" aria-hidden="true">
        Overload
      </p>
      <div className="mkt-main">
        <HardCard as="section" className="mkt-card">
          <div>
            <PageHeader as="h1" title="Lift a little more, on purpose." meta={["Web app", "Live"]} description="A training log for progressive overload: log your sets, watch weight and reps climb, and get a weekly note on what the numbers say." />
            <div className="mkt-cta">
              <ButtonLink href="/sign-up">Create account</ButtonLink>
              <ButtonLink href="/sign-in" variant="ghost">
                Sign in
              </ButtonLink>
            </div>
          </div>
          <div aria-label="Example progress card">
            <p className="mkt-meta">
              <span>Example data</span>
              <span aria-hidden="true">/</span>
              <span>Back squat</span>
            </p>
            <div className="flex flex-wrap items-end gap-8">
              <Stat label="Estimated 1RM" value="142.5" unit="kg" size="lg" pr />
              <Stat label="Sessions to forecast" value="6" size="md" />
            </div>
          </div>
        </HardCard>

        <section aria-labelledby="how-title" className="mt-12">
          <SectionHeader as="h2" id="how-title" index={1} title="What it does" />
          <div className="mkt-grid">
            {FEATURES.map((f) => (
              <article key={f.title} className="mkt-feature">
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="insights-title" className="mt-12">
          <SectionHeader as="h2" id="insights-title" index={2} title="Insights you can check" />
          <HardCard className="max-w-3xl">
            <p className="m-0">
              Each week, Claude reads your own logs and writes a short note: what moved, what stalled, and what to try. Every suggestion links to the numbers
              and the research behind it, so you can disagree with it.
            </p>
          </HardCard>
        </section>
      </div>
    </>
  );
}
