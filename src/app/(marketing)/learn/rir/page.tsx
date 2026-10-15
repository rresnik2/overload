import { Article, Cite, InApp, LearnSection, SourceList } from "@/components/learn/Article";

export const metadata = { title: "Reps in reserve (RIR)", description: "How close to failure to train, and how well you can judge it." };

export default function Page() {
  return (
    <Article
      title="Reps in reserve (RIR)"
      lede="RIR is how many more reps you could have done when you stopped a set. Zero means you hit failure; three means you stopped with three left."
    >
      <LearnSection title="Why record it">
        <p>
          Weight and reps alone do not say how hard a set was. The same 8 reps can be easy or a grind. Recording RIR makes sets comparable, feeds the e1RM estimate, and tells Overload which sets counted as hard sets for weekly volume. RPE is the same scale turned around: RPE is 10 minus RIR, and Overload only shows it for display.
        </p>
      </LearnSection>

      <LearnSection title="How close to failure?">
        <p>
          Pushing sets closer to failure tends to help muscle growth, but the last reps add little. A 2023 meta-analysis found no evidence that training to momentary muscular failure beats stopping short of it for hypertrophy, with at most a trivial advantage for sets taken to failure under looser definitions (<Cite id="refalo2023" />). A practitioner summary of a 2024 dose-response meta-analysis reports that hypertrophy rises as sets get closer to failure, while strength gains differ little (<Cite id="robinson2024" />).
        </p>
        <p>
          Overload&rsquo;s guidance is a working range, not a finding from one paper: most sets near zero to three reps in reserve for growth. Failure is allowed, it is just not required.
        </p>
      </LearnSection>

      <LearnSection title="You are not a perfect judge">
        <p>
          People misjudge how many reps they have left, and more so far from failure. In one study of 25 trained men doing a squat set at 70% of their max (about 16 reps), the lifters could do about 2 more reps than they predicted when they called one rep left, about 3.7 more when they called three, and about 5 more when they called five. Predictions were more accurate in lower-rep sets and close to failure (<Cite id="zourdos2021" />). It is one lift in one small group, but the direction matches common experience.
        </p>
        <p>So an RIR of 4 or more, and any RIR on sets of many reps, is the least reliable number you will log.</p>
      </LearnSection>

      <LearnSection title="Rest between sets">
        <p>
          Effort interacts with rest. In one 8-week study of 21 trained men, a 3-minute rest between sets produced greater gains in squat and bench strength and in quadriceps muscle thickness than a 1-minute rest, with other training held constant; the difference in triceps thickness was a trend (<Cite id="schoenfeld2016rest" />). It is one small study, so treat it as a reason not to rush your rests rather than a rule.
        </p>
      </LearnSection>

      <InApp>
        <p>A hard set in Overload is a completed, non-warm-up set with RIR of 4 or fewer, or with no RIR logged. If you leave RIR blank, the set counts as hard. Log it when you can: the effort check in your weekly insights uses it.</p>
      </InApp>

      <SourceList ids={["refalo2023", "robinson2024", "zourdos2021", "schoenfeld2016rest"]} />
    </Article>
  );
}
