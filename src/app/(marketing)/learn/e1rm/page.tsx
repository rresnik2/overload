import { Article, Cite, InApp, LearnSection, SourceList } from "@/components/learn/Article";

export const metadata = { title: "Estimated one-rep max (e1RM)", description: "How Overload estimates your max from a working set, and why a small change is noise." };

export default function Page() {
  return (
    <Article
      title="Estimated one-rep max (e1RM)"
      lede="Your one-rep max is the heaviest single you could lift. You rarely test it, so Overload estimates it from the sets you actually do."
    >
      <LearnSection title="The formula">
        <p>
          Overload uses the Epley formula with reps in reserve folded in: <span className="num">weight &times; (1 + (reps + RIR) / 30)</span>. A set of 100 kg for 5 reps with 2 reps left is treated like a set taken to 7 reps. A single rep with no reps in reserve is simply the weight. Brzycki, <span className="num">36 &times; weight / (37 &minus; reps)</span>, is available as a setting.
        </p>
        <p>
          Estimates from higher-rep sets are less trustworthy, so Overload gives no estimate when reps plus RIR is above 12, and marks one above 10 as low confidence. These limits are a design choice of the app.
        </p>
      </LearnSection>

      <LearnSection title="Why small changes are noise">
        <p>
          Even a real one-rep-max test is not perfectly repeatable. A systematic review of 32 studies found test-retest coefficients of variation ranging from 0.5% to 12.1%, with a median of 4.2% (<Cite id="grgic2020" />). An estimate from a working set is rougher still. That is why Overload treats a change smaller than about 5% as noise: a lift flagged as &ldquo;flat&rdquo; may be getting stronger or weaker by an amount you cannot tell apart from a bad day.
        </p>
      </LearnSection>

      <LearnSection title="How to use it">
        <ul>
          <li>Compare e1RM with itself over weeks, not across exercises. It is a trend line, not a result.</li>
          <li>Machine and cable lifts keep a separate e1RM for each machine, because a number on one stack does not mean the same load on another. See <a href="/learn/machine-vs-free-weight" className="link-underline">machines vs. free weights</a>.</li>
          <li>Bodyweight lifts use bodyweight times a fraction plus any added weight, so your e1RM moves when your bodyweight does.</li>
        </ul>
      </LearnSection>

      <LearnSection title="Further reading">
        <p>
          Work on modelling the load-repetition relationship for individual lifters (<Cite id="mitter2022" />) and a 2026 preprint that fitted a new equation to a large set of near-failure sets (<Cite id="e1rmArxiv2026" />) show that every single formula is an average. We have not adopted either; they are listed as context.
        </p>
      </LearnSection>

      <InApp>
        <p>The e1RM you see is a tracking tool. Use it to spot a stall or a trend; do not use it to pick your next attempt on a max day.</p>
      </InApp>

      <SourceList ids={["grgic2020", "mitter2022", "e1rmArxiv2026"]} />
    </Article>
  );
}
