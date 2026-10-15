import { Article, Cite, Contested, InApp, LearnSection, SourceList } from "@/components/learn/Article";

export const metadata = { title: "Weekly volume and volume landmarks", description: "How many hard sets per muscle per week, with diminishing returns." };

export default function Page() {
  return (
    <Article
      title="Weekly volume and volume landmarks"
      lede="Volume is how many hard sets a muscle gets per week. More helps, up to a point, and the gains from each extra set shrink."
    >
      <LearnSection title="More sets, more growth, with diminishing returns">
        <p>
          A 2017 meta-regression of 15 studies found a graded dose-response: each additional weekly set was associated with a small extra gain in muscle size, about 0.37% (<Cite id="schoenfeld2017volume" />). A 2025 meta-regression of 67 studies reached the same direction, and found the benefit of extra volume diminishes, much more sharply for strength than for muscle size (<Cite id="pelland2025" />).
        </p>
        <p>
          A review comparing moderate (12 to 20 weekly sets) and high (more than 20) volumes found no difference for the quadriceps or biceps, but an edge for high volume in the triceps, and suggested 12 to 20 weekly sets per muscle as a reasonable range for young trained men (<Cite id="bazvalle2022" />).
        </p>
      </LearnSection>

      <LearnSection title="Counting sets">
        <p>
          The same 2025 analysis found the best fit when a hard set counts fully for the muscle it targets and half for muscles that help (<Cite id="pelland2025" />). Overload counts the same way: a set is 1 for a primary muscle and 0.5 for a secondary muscle, and the weekly total is in &ldquo;fractional sets&rdquo;. Machine sets count fully.
        </p>
      </LearnSection>

      <LearnSection title="Per session">
        <p>
          <Contested /> A preprint, not yet peer reviewed, found returns from extra sets within a single session diminish, with no detectable extra benefit past about 11 fractional sets for hypertrophy (<Cite id="remmert2025" />). Overload mentions this ceiling but always labels it as a preprint.
        </p>
      </LearnSection>

      <LearnSection title="What are volume landmarks?">
        <p>
          &ldquo;Landmarks&rdquo; such as minimum effective volume, maximum adaptive volume and maximum recoverable volume are a coaching framework for picking a weekly number between &ldquo;too little to grow&rdquo; and &ldquo;more than you can recover from&rdquo;. The names come from coaching practice rather than from a single study, and the exact numbers differ by person, muscle and how much else is going on in your life. Overload does not present them as findings.
        </p>
        <p>What Overload does use is a band for each muscle, from the research above:</p>
        <ul>
          <li>Build muscle: 10 to 20 fractional sets per week.</li>
          <li>Get stronger: 4 to 10 fractional sets per week. The research on strength points to sharper diminishing returns after roughly this range.</li>
          <li>General fitness: 4 to 20. This is an assumption, because the research does not define a general-fitness band; it only flags very low or very high weeks.</li>
          <li>Lose weight: 10 to 20, the same as building muscle. This is also an assumption: the research brief gives no lower &ldquo;maintenance&rdquo; floor, so Overload does not tell you to cut your sets.</li>
        </ul>
      </LearnSection>

      <InApp>
        <p>The weekly review flags muscles under the floor or over the ceiling of your band. Treat the band as a starting point and adjust to how you recover. Warm-up sets do not count, and a deload week is not flagged.</p>
      </InApp>

      <SourceList ids={["schoenfeld2017volume", "pelland2025", "bazvalle2022", "remmert2025"]} />
    </Article>
  );
}
