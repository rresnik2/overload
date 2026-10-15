"use client";
import { useState } from "react";
import { dismissTip, useTipHidden } from "@/components/ui/tips";
import { Term } from "@/components/ui/Term";

const TIP_ID = "workout-guide";

/** First-run "How logging works" panel for an active workout. Dismiss it once; the "?" in the header brings it back. */
export function useLoggingGuide() {
  const dismissed = useTipHidden(TIP_ID);
  const [reopened, setReopened] = useState(false);
  const open = !dismissed || reopened;
  return {
    open,
    close: () => {
      dismissTip(TIP_ID);
      setReopened(false);
    },
    toggle: () => (open ? (dismissTip(TIP_ID), setReopened(false)) : setReopened(true)),
  };
}

export function LoggingGuide({ onClose }: { onClose: () => void }) {
  return (
    <section className="log-guide" aria-labelledby="log-guide-title" data-testid="logging-guide">
      <div className="log-guide__head">
        <h2 id="log-guide-title" className="log-guide__title">
          How logging works
        </h2>
      </div>
      <ol className="log-guide__steps">
        <li>Add an exercise, then fill in each set: the weight (its <Term id="loadLabel">label</Term> says what the number means), the reps, and how hard it felt (<Term id="rir">reps in reserve</Term>). Most sets work best 0 to 3 reps short of <Term id="failure">failure</Term>.</li>
        <li>Tap the check when a set is done. Any box you left empty is filled from last time, and the <Term id="restTimer">rest timer</Term> starts.</li>
        <li>Use the set type menu for <Term id="warmupSet">warm-ups</Term>, <Term id="dropSet">drop sets</Term> and <Term id="amrap">AMRAP</Term>. Only <Term id="hardSet">hard sets</Term> count toward your weekly totals.</li>
        <li>Tap Finish when you are done. Overload saves the workout, looks for personal records and updates your charts.</li>
      </ol>
      <div className="log-guide__foot">
        <p className="wk-muted">Tap any small i for a short explanation.</p>
        <button type="button" className="page-intro__dismiss" onClick={onClose}>
          Got it
        </button>
      </div>
    </section>
  );
}
