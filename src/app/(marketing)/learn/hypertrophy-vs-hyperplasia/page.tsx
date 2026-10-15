import { Article, Cite, Contested, InApp, LearnSection, SourceList } from "@/components/learn/Article";

export const metadata = { title: "Hypertrophy vs. hyperplasia", description: "Muscles grow mainly because fibers get larger. Whether adults gain new fibers is unresolved and likely minor." };

export default function Page() {
  return (
    <Article
      title="Hypertrophy vs. hyperplasia"
      lede="Muscles grow mainly because fibers get larger; whether adults gain new fibers is unresolved and likely minor. Training well for size covers it."
    >
      <LearnSection title="Two ways a muscle could get bigger">
        <p>
          <strong>Hypertrophy</strong> means the muscle fibers you already have get larger. <strong>Hyperplasia</strong> means new fibers form. Everyone agrees on the first. The second is the open question.
        </p>
        <p>
          Hypertrophy is well established: more mechanical load makes the cross-sectional area of muscle fibers increase. How the fibers grow on the inside is less settled. A 2020 scoping review notes that even basic questions, such as whether fibers grow by enlarging existing myofibrils or by adding more of them, have not been resolved (<Cite id="jorgenson2020" />).
        </p>
      </LearnSection>

      <LearnSection title="What the hyperplasia evidence looks like">
        <ul>
          <li>
            <strong>Animals.</strong> A review of animal experiments reported that fiber counts rose under stretch overload and in exercise models, and suggested it might happen in human athletes too (<Cite id="antonio1993" />). Those are extreme overload models, not a normal training week.
          </li>
          <li>
            <strong>Bodybuilders.</strong> A 1984 study estimated biceps fiber number in elite and intermediate bodybuilders and in untrained controls. The bodybuilders had much larger muscles but the same number of fibers, and the authors put the differences down to genetics rather than training (<Cite id="macdougall1984" />). It compared different people at one point in time, so it cannot show what training did to any one of them.
          </li>
          <li>
            <strong>Before and after training.</strong> A 2025 conference abstract pooled eleven studies that estimated fiber number before and after resistance training and found no change on average. Its authors concluded that meaningful hyperplasia is unlikely, while noting it could be hard to detect because the training periods were short and fiber counts are difficult to estimate (<Cite id="gowda2025" />). It is an abstract, not a full peer-reviewed paper.
          </li>
          <li>
            <strong>The other view.</strong> <Contested /> A 2006 magazine article argues that the muscle mass seen after very heavy resistance training at the top end is hard to explain by larger fibers alone, and that fiber hyperplasia likely contributes (<Cite id="dantona2006" />).
          </li>
        </ul>
        <p>
          Putting it together: new fibers in adult humans have not been shown, cannot be ruled out, and if they happen the effect is likely small next to making existing fibers bigger.
        </p>
      </LearnSection>

      <LearnSection title="What about sarcoplasmic and myofibrillar growth?">
        <p>
          <Contested /> Some researchers think fibers can grow partly by expanding the fluid and non-contractile part of the cell (sarcoplasm) rather than by adding contractile protein. A study of thirty trained men after six weeks of high-volume training found that, in the fifteen who showed fiber growth, concentrations of two contractile proteins tended to fall while sarcoplasmic proteins rose, which the authors read as sarcoplasmic expansion (<Cite id="haun2019" />). A review titled around whether this is a &ldquo;unicorn&rdquo; or a real adaptation treats it as plausible but unsettled (<Cite id="roberts2020sarcoplasmic" />).
        </p>
        <p>Nobody has shown a way to program training for one kind of growth over the other.</p>
      </LearnSection>

      <InApp>
        <p>
          Overload does not have a hyperplasia mode, and it does not offer a program for &ldquo;sarcoplasmic&rdquo; or &ldquo;myofibrillar&rdquo; growth. If you train hard, close to failure, with enough weekly sets and progress the load over time, you are already doing what the evidence supports for size, whatever the cell-level mechanism turns out to be.
        </p>
      </InApp>

      <SourceList ids={["jorgenson2020", "antonio1993", "macdougall1984", "gowda2025", "dantona2006", "haun2019", "roberts2020sarcoplasmic"]} />
    </Article>
  );
}
