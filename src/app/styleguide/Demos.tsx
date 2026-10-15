"use client";
// Interactive demos for /styleguide (client-only pieces: steppers, tabs, sheet, toasts).
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dial } from "@/components/ui/Dial";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { NumberStrip } from "@/components/ui/NumberStrip";
import { Modal, Sheet } from "@/components/ui/Sheet";
import { ModalityTabs, Tabs, type ModalityTab } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { Modality } from "@/contracts/enums";

export function StepperDemo() {
  const [weight, setWeight] = useState<number | null>(82.5);
  const [reps, setReps] = useState<number | null>(8);
  const [rir, setRir] = useState<number | null>(2);
  return (
    <div className="sg-grid">
      <NumberStepper label="Weight" kind="weight" unit="kg" step={2.5} value={weight} onChange={setWeight} hint="Steps by the exercise's increment" />
      <NumberStepper label="Reps" kind="reps" step={1} value={reps} onChange={setReps} />
      <NumberStepper label="RIR" kind="rir" step={1} min={0} max={10} value={rir} onChange={setRir} hint="Reps in reserve" />
      <NumberStepper label="Weight (error)" kind="weight" unit="kg" step={2.5} value={null} onChange={() => {}} error="Enter a weight" />
      <NumberStepper label="Weight (disabled)" kind="weight" unit="kg" step={2.5} value={60} onChange={() => {}} disabled />
    </div>
  );
}

const DIAL_WEIGHTS = Array.from({ length: 113 }, (_, i) => 20 + i * 2.5);
const DIAL_REPS = Array.from({ length: 30 }, (_, i) => i + 1);

/** The dial over bar weights (rim and ink from the plate tokens), the rep strip, an empty dial and a disabled one. */
export function DialDemo() {
  const [weight, setWeight] = useState<number | null>(102.5);
  const [reps, setReps] = useState<number | null>(5);
  const [empty, setEmpty] = useState<number | null>(null);
  const [ticks, setTicks] = useState(0);
  return (
    <div className="sg-grid">
      <div className="sg-stack">
        <Dial
          label="Set 3 weight"
          values={DIAL_WEIGHTS}
          value={weight}
          onChange={setWeight}
          valueText={(v) => `${v} kilograms total`}
          onDetent={() => setTicks((n) => n + 1)}
          rim="plate-red"
          ink="#ffffff"
        />
        <p className="num m-0">
          {weight} kg · {ticks} detents
        </p>
        <p className="m-0">Drag in a circle (clockwise adds), or focus it and use the arrows, Page Up/Down, Home/End or the mouse wheel.</p>
      </div>
      <div className="sg-stack">
        <NumberStrip label="Reps" values={DIAL_REPS} value={reps} onChange={setReps} valueText={(v) => `${v} reps`} />
        <NumberStrip label="Reps (empty)" values={DIAL_REPS} value={null} onChange={() => {}} />
        <NumberStrip label="Reps (disabled)" values={DIAL_REPS} value={8} onChange={() => {}} disabled />
        <p className="num m-0">{reps} reps</p>
      </div>
      <div className="sg-stack">
        <Dial label="Dumbbell weight, no value yet" labelHint="loadTotal" values={[10, 12, 14, 16, 18, 20]} value={empty} onChange={setEmpty} valueText={(v) => `${v} kilograms per hand`} restIndex={0} />
        <p className="num m-0">{empty ?? "—"}</p>
      </div>
      <div className="sg-stack">
        <Dial label="Weight (disabled)" values={DIAL_WEIGHTS} value={60} onChange={() => {}} valueText={(v) => `${v} kilograms`} disabled />
      </div>
    </div>
  );
}

export function TabsDemo() {
  const [modality, setModality] = useState<ModalityTab>(Modality.FREE_WEIGHT);
  return (
    <div className="sg-stack">
      <ModalityTabs value={modality} onChange={setModality} />
      <p className="num m-0">
        Selected: <strong>{modality}</strong>
      </p>
      <Tabs
        label="Progress views"
        items={[
          { id: "e1rm", label: "e1RM", panel: <p className="m-0">Estimated one-rep max over time.</p> },
          { id: "volume", label: "Volume", panel: <p className="m-0">Weekly sets per muscle group.</p> },
          { id: "prs", label: "PRs", panel: <p className="m-0">Personal records, newest first.</p> },
          { id: "soon", label: "Soon", disabled: true },
        ]}
      />
    </div>
  );
}

export function OverlayDemo() {
  const [sheet, setSheet] = useState(false);
  const [modal, setModal] = useState(false);
  const { toast } = useToast();
  return (
    <div className="sg-row">
      <Button variant="ink" onClick={() => setSheet(true)}>
        Open sheet
      </Button>
      <Button variant="ink" onClick={() => setModal(true)}>
        Open modal
      </Button>
      <Button variant="ghost" onClick={() => toast({ kind: "pr", title: "New PR: Back squat", description: "142.5 kg estimated 1RM" })}>
        PR toast
      </Button>
      <Button variant="ghost" onClick={() => toast({ kind: "success", title: "Synced", description: "3 sets uploaded" })}>
        Success toast
      </Button>
      <Button variant="ghost" onClick={() => toast({ kind: "info", title: "Update ready", action: { label: "Reload", onClick: () => {} } })}>
        Info toast
      </Button>
      <Button variant="ghost" onClick={() => toast({ kind: "error", title: "Couldn't sync", description: "We'll retry when you're online." })}>
        Error toast
      </Button>
      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Rest timer"
        description="Bottom sheet on mobile, dialog on desktop"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSheet(false)}>
              Cancel
            </Button>
            <Button onClick={() => setSheet(false)}>Done</Button>
          </>
        }
      >
        <p className="m-0">Native dialog: focus is trapped, Escape closes, the page behind is inert.</p>
      </Sheet>
      <Modal open={modal} onClose={() => setModal(false)} title="Delete workout?" footer={<Button variant="danger" onClick={() => setModal(false)}>Delete</Button>}>
        <p className="m-0">This removes the workout and its sets from every device.</p>
      </Modal>
    </div>
  );
}
