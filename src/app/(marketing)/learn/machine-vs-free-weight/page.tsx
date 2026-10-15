import { Article, Cite, InApp, LearnSection, SourceList } from "@/components/learn/Article";

export const metadata = { title: "Machines vs. free weights", description: "Similar muscle growth, but machine loads are not comparable across brands." };

export default function Page() {
  return (
    <Article
      title="Machines vs. free weights"
      lede="For building muscle, machines and free weights do about the same job. For tracking, a machine load is only comparable with the same machine."
    >
      <LearnSection title="What the research says">
        <p>
          A 2023 meta-analysis of 13 studies compared free-weight and machine training. Muscle growth did not differ between them. Strength gains were specific: free-weight training improved free-weight tests more, and machine training tended to improve machine tests more. The authors concluded the choice comes down to personal preference and goals (<Cite id="haugen2023" />).
        </p>
      </LearnSection>

      <LearnSection title="Why machine numbers do not travel">
        <p>
          A barbell plate weighs the same everywhere. A machine does not: cams, lever arms, pulley ratios and friction change how a number on the stack relates to the force on your muscles, and two machines of the same name from different brands can feel very different. A plate-loaded machine may or may not count the weight of its sled. So 80 kg on one leg press says little about 80 kg on another.
        </p>
        <p>These are mechanical facts about equipment rather than a particular study, which is why Overload treats them as rules:</p>
        <ul>
          <li>Each machine or cable setup you log against gets its own progress series. A new gym or a different machine starts a new series.</li>
          <li>Machine sets count fully toward weekly muscle volume.</li>
          <li>Machine lifts get no strength score, no percentile and no conversion to a barbell equivalent.</li>
          <li>When a machine&rsquo;s smallest weight step is a large share of your load, the progression advice is to add reps first.</li>
        </ul>
      </LearnSection>

      <LearnSection title="Guidelines">
        <p>
          The American College of Sports Medicine published updated resistance-training guidelines in 2026, the first update in 17 years; the news release is the link we have (<Cite id="acsm2026" />). We cite it only as a pointer to the position stand, not for any specific number.
        </p>
      </LearnSection>

      <InApp>
        <p>Log the machine you use, with its gym and brand if you like. Your progress on it is then compared with itself, which is the only comparison that means anything.</p>
      </InApp>

      <SourceList ids={["haugen2023", "acsm2026"]} />
    </Article>
  );
}
