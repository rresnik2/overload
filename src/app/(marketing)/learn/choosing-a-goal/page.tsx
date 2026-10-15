import Link from "next/link";
import type { ReactNode } from "react";
import { Article, Cite, InApp, LearnSection, SourceList } from "@/components/learn/Article";

export const metadata = {
  title: "Choosing a goal",
  description: "Build muscle, get stronger, general fitness or lose weight: what each goal changes in Overload, and how they overlap.",
};

type Row = { label: string; cells: [ReactNode, ReactNode, ReactNode, ReactNode] };

const ROWS: Row[] = [
  {
    label: "What you are optimizing",
    cells: ["Muscle size", "The most weight you can lift on your main lifts", "Staying strong and capable overall", "Losing weight while keeping your muscle and strength"],
  },
  {
    label: "Typical reps and load",
    cells: [
      <>Light to heavy loads grow similar amounts of muscle when sets end near failure (<Cite id="schoenfeld2017load" />). Overload&rsquo;s default is 8 to 12 reps.</>,
      <>Heavier loads, because they gave bigger gains in one-rep max (<Cite id="schoenfeld2017load" />). Overload&rsquo;s default is 3 to 6 reps.</>,
      "A mix. Overload defaults to 8 to 12 reps and does not push you toward any range.",
      "The same as building muscle: 8 to 12 reps by default. Keep your heavy sets heavy.",
    ],
  },
  {
    label: "Weekly sets per muscle",
    cells: [
      <>About 10 to 20, with shrinking returns (<Cite id="schoenfeld2017volume" />, <Cite id="pelland2025" />, <Cite id="bazvalle2022" />).</>,
      <>About 4 to 10. Extra sets help strength less than they help size (<Cite id="pelland2025" />).</>,
      "4 to 20. This is Overload's assumption; it only flags weeks that are very light or very heavy.",
      "10 to 20, the same as building muscle. This is an assumption: the research gives no lower floor, so Overload does not tell you to cut your sets.",
    ],
  },
  {
    label: "Effort (reps in reserve)",
    cells: [
      <>Most sets 0 to 3 reps short of failure; going all the way adds little (<Cite id="refalo2023" />, <Cite id="robinson2024" />).</>,
      "Hard working sets. Overload does not set a separate effort target for strength.",
      "No target. Log your effort when you can.",
      "As for building muscle: about 0 to 3 reps short of failure.",
    ],
  },
  {
    label: "Rest between sets",
    cells: [
      <>Rest length matters little for muscle size (<Cite id="singer2024" />).</>,
      <>2 to 5 minutes between heavy sets is Overload&rsquo;s guidance. In one small 8-week study, 3 minutes beat 1 minute for strength (<Cite id="schoenfeld2016rest" />).</>,
      "Whatever fits your session.",
      "As for building muscle.",
    ],
  },
  {
    label: "Training frequency",
    cells: [
      <>Matters little once weekly sets are equal; the effect is compatible with none (<Cite id="pelland2025" />).</>,
      <>Training a lift more often helps, with diminishing returns, so Overload nudges you toward twice a week (<Cite id="pelland2025" />).</>,
      "No target. Overload does not set a training frequency for this goal.",
      "No target. Overload does not set a training frequency for this goal.",
    ],
  },
  {
    label: "What Overload emphasizes",
    cells: [
      "Weekly sets per muscle against the 10 to 20 band, and a check that your reps are not all very low.",
      "Estimated max and its forecast, the twice-a-week nudge, and a check that you are not doing mostly high reps.",
      "Weekly sets only when very low or very high. No rep-range check.",
      "Your bodyweight trend and rate of loss. Holding strength counts as on track, not behind.",
    ],
  },
  {
    label: "How fast progress usually is",
    cells: [
      "Slowly, over months, and fastest for beginners.",
      <>Quick at first, then slower: in one large preprint of mostly middle-aged adults training once a week, strength rose about 30 to 50% in the first year and levelled off after 1 to 2 years (<Cite id="steele2022" />).</>,
      "Steady. Progress is not the point, so there is no pace to chase.",
      <>About 0.5 to 1% of bodyweight a week is the pace suggested for keeping muscle (<Cite id="helms2014" />). Strength tends to hold.</>,
    ],
  },
];

export default function Page() {
  return (
    <Article
      title="Choosing a goal"
      lede="Overload has four goals. They change your weekly set targets, your default rep range and which insights you see. You can switch any time, and nothing you logged is lost."
    >
      <LearnSection title="The goals side by side">
        <div className="learn__table-wrap" role="region" aria-label="Comparison of the four goals (scrollable)" tabIndex={0}>
          <table className="learn__table">
            <caption className="sr-only">What each training goal changes in Overload</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Topic</span>
                </th>
                <th scope="col">Build muscle</th>
                <th scope="col">Get stronger</th>
                <th scope="col">General fitness</th>
                <th scope="col">Lose weight</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {row.cells.map((cell, i) => (
                    <td key={i}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LearnSection>

      <LearnSection title="The goals overlap">
        <p>
          Training for size also makes you stronger, and training for strength also builds some muscle, so none of these goals is a separate world. The differences are about emphasis: how many sets you aim for, how heavy the weights are, and what the app points out. Both size and strength gains rise with weekly sets, though strength levels off sooner (<Cite id="pelland2025" />).
        </p>
      </LearnSection>

      <LearnSection title="Lose weight: diet drives the weight, lifting protects the muscle">
        <p>
          Weight loss comes mainly from how much you eat compared with how much energy you use. Lifting does not do that part. What lifting does is tell your body to keep its muscle while weight comes off. A meta-analysis of trials that combined resistance training with an energy deficit found that gains in lean mass were smaller than without a deficit, while gains in strength were about the same (<Cite id="murphy2022" />). So the aim here is to keep your lifts steady, not to chase records.
        </p>
        <p>
          For pace, a review written for natural bodybuilders preparing for competition recommends a bodyweight loss of about 0.5 to 1% per week to hold on to muscle (<Cite id="helms2014" />). It is not a study of everyday dieters, so treat it as a reference range, not a rule. Overload&rsquo;s insights compare your smoothed bodyweight trend with it, and flag a pace that is faster than 1% a week or a trend that has stayed flat for about three weeks.
        </p>
        <p>
          For protein, one meta-analysis of resistance-training trials found no further gain in lean mass above about 1.6 g per kg of bodyweight per day (<Cite id="morton2018" />). That analysis was not of people losing weight, and Helms 2014 suggests higher figures for lean people who are dieting hard. Overload shows 1.6 g per kg as a reference point only: it does not give calorie targets or medical advice.
        </p>
      </LearnSection>

      <LearnSection title="Which should you pick?">
        <p>
          Pick the one that matches what you want in the next few months. If you are not sure, Build muscle or General fitness are safe starting points. Your goal only changes targets and wording, never your data, so you can try one and change it in{" "}
          <Link href="/settings/profile" className="link-underline">
            Settings
          </Link>
          .
        </p>
      </LearnSection>

      <InApp>
        <p>Your goal sets the weekly set band on the Progress page, the default rep range for progression nudges, and which insight cards appear. For Lose weight it also adds the rate-of-loss card and treats holding strength as on track.</p>
      </InApp>

      <SourceList ids={["schoenfeld2017load", "schoenfeld2017volume", "pelland2025", "bazvalle2022", "refalo2023", "robinson2024", "singer2024", "schoenfeld2016rest", "steele2022", "murphy2022", "helms2014", "morton2018"]} />
    </Article>
  );
}
