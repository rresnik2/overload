"use client";
// The body page's online form: add / edit / delete a measurement, with the US Navy tape calculator. Writes go through Server
// Actions (which post to applyServerMutations); afterwards the page refreshes and a sync pulls the row into the local database.
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { FormAlert } from "@/components/auth/FormAlert";
import { formatDate, METHOD_LABEL, unitLabel, weightText } from "@/components/charts/format";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { InfoHint } from "@/components/ui/InfoHint";
import { syncNow } from "@/client/sync";
import type { BodyFatMethod, Sex } from "@/contracts/enums";
import { navyBodyFat } from "@/lib/analytics/scores";
import { fromKg, type WeightUnit } from "@/lib/units";
import { addBodyMetricAction, deleteBodyMetricAction, editBodyMetricAction } from "@/server/actions/body";
import type { BodyEntry } from "@/server/queries/body.shape";
import { buildBodyPayload, EMPTY_BODY_FORM, type BodyFormValues } from "./payload";

const METHODS: BodyFatMethod[] = ["NAVY_TAPE", "DEXA", "BIA", "CALIPERS", "SCALE"];

function valuesOf(entry: BodyEntry, unit: WeightUnit): BodyFormValues {
  const t = (n: number | null) => (n == null ? "" : String(n));
  return {
    localDate: entry.localDate,
    weight: entry.weightKg == null ? "" : String(Math.round(fromKg(entry.weightKg, unit) * 10) / 10),
    bodyFatPct: t(entry.bodyFatPct),
    bodyFatMethod: entry.bodyFatMethod ?? "",
    neckCm: t(entry.neckCm),
    waistCm: t(entry.waistCm),
    hipCm: t(entry.hipCm),
    chestCm: t(entry.chestCm),
    armCm: t(entry.armCm),
    thighCm: t(entry.thighCm),
    calfCm: t(entry.calfCm),
    notes: entry.notes ?? "",
  };
}

export interface BodyLogProps {
  today: string;
  unit: WeightUnit;
  sex: Sex | null;
  heightCm: number | null;
  entries: BodyEntry[];
}

export function BodyLog({ today, unit, sex, heightCm, entries }: BodyLogProps) {
  const router = useRouter();
  const formId = useId();
  const [values, setValues] = useState<BodyFormValues>(() => EMPTY_BODY_FORM(today));
  const [editing, setEditing] = useState<BodyEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const set = (key: keyof BodyFormValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const navySex = sex === "MALE" || sex === "FEMALE" ? sex : null;
  const needsHip = navySex === "FEMALE";
  const navy = useMemo(() => {
    if (!navySex || heightCm == null) return null;
    const neck = Number.parseFloat(values.neckCm);
    const waist = Number.parseFloat(values.waistCm);
    const hip = Number.parseFloat(values.hipCm);
    if (!Number.isFinite(neck) || !Number.isFinite(waist)) return null;
    return navyBodyFat({ sex: navySex, heightCm, neckCm: neck, waistCm: waist, hipCm: Number.isFinite(hip) ? hip : null });
  }, [navySex, heightCm, values.neckCm, values.waistCm, values.hipCm]);
  const navySelected = values.bodyFatMethod === "NAVY_TAPE";

  function reset() {
    setValues(EMPTY_BODY_FORM(today));
    setEditing(null);
    setFieldErrors({});
  }

  function done(message: string) {
    setNotice(message);
    setError(null);
    setFieldErrors({});
    reset();
    router.refresh();
    void syncNow("manual");
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const payload = buildBodyPayload(values, unit);
    startTransition(async () => {
      const result = editing ? await editBodyMetricAction({ id: editing.id, fields: payload }) : await addBodyMetricAction(payload);
      if (result.ok) done(editing ? "Measurement updated." : "Measurement saved.");
      else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  function onDelete(entry: BodyEntry) {
    if (!window.confirm(`Delete the measurement from ${formatDate(entry.localDate, true)}?`)) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await deleteBodyMetricAction({ id: entry.id });
      if (result.ok) done("Measurement deleted.");
      else setError(result.error);
    });
  }

  const err = (k: string) => fieldErrors[k];
  const bodyFatShown = navySelected ? (navy != null ? String(navy) : "") : values.bodyFatPct;

  return (
    <div className="body-log">
      <form onSubmit={onSubmit} className="body-form" aria-labelledby={`${formId}-title`} noValidate>
        <h3 id={`${formId}-title`} className="body-form__title">
          {editing ? `Edit measurement, ${formatDate(editing.localDate, true)}` : "Log a measurement"}
        </h3>
        {error ? <FormAlert>{error}</FormAlert> : null}
        {err("_") ? <FormAlert>{err("_")}</FormAlert> : null}
        {notice ? <FormAlert kind="success">{notice}</FormAlert> : null}

        <div className="body-form__grid">
          <Field label="Date" type="date" value={values.localDate} onChange={set("localDate")} max={today} required error={err("localDate")} />
          <Field label="Weight" kind="weight" unit={unitLabel(unit)} value={values.weight} onChange={set("weight")} error={err("weightKg")} />
        </div>

        <fieldset className="body-form__group">
          <legend>
            Tape measurements (cm)
            <InfoHint term="navyTape" />
          </legend>
          <div className="body-form__grid body-form__grid--3">
            <Field label="Neck" kind="weight" unit="cm" value={values.neckCm} onChange={set("neckCm")} error={err("neckCm")} />
            <Field label="Waist" kind="weight" unit="cm" value={values.waistCm} onChange={set("waistCm")} error={err("waistCm")} hint="At the navel" />
            <Field label={needsHip ? "Hip" : "Hip (optional)"} kind="weight" unit="cm" value={values.hipCm} onChange={set("hipCm")} error={err("hipCm")} />
            <Field label="Chest" kind="weight" unit="cm" value={values.chestCm} onChange={set("chestCm")} error={err("chestCm")} />
            <Field label="Arm" kind="weight" unit="cm" value={values.armCm} onChange={set("armCm")} error={err("armCm")} />
            <Field label="Thigh" kind="weight" unit="cm" value={values.thighCm} onChange={set("thighCm")} error={err("thighCm")} />
            <Field label="Calf" kind="weight" unit="cm" value={values.calfCm} onChange={set("calfCm")} error={err("calfCm")} />
          </div>
        </fieldset>

        <fieldset className="body-form__group" data-testid="navy-calculator">
          <legend>
            Body fat
            <InfoHint term="bodyFatMethods" />
          </legend>
          <div className="body-form__grid">
            <Field label="Body fat" kind="weight" unit="%" value={bodyFatShown} onChange={set("bodyFatPct")} disabled={navySelected} error={err("bodyFatPct")} />
            <div className="field">
              <label htmlFor={`${formId}-method`} className="field__label">Method</label>
              <div className="field__control">
                <select id={`${formId}-method`} className="field__input select" value={values.bodyFatMethod} onChange={set("bodyFatMethod")} aria-invalid={err("bodyFatMethod") ? true : undefined}>
                  <option value="">Not measured</option>
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m === "NAVY_TAPE" ? "US Navy tape (calculated)" : METHOD_LABEL[m]}
                    </option>
                  ))}
                </select>
              </div>
              {err("bodyFatMethod") ? <p className="field__error">{err("bodyFatMethod")}</p> : null}
            </div>
          </div>
          <NavyEstimate
            navy={navy}
            selected={navySelected}
            ready={Boolean(navySex && heightCm != null)}
            needsHip={needsHip}
            onUse={() => setValues((v) => ({ ...v, bodyFatMethod: "NAVY_TAPE" }))}
          />
        </fieldset>

        <Field label="Notes (optional)" value={values.notes} onChange={set("notes")} maxLength={500} />

        <div className="body-form__actions">
          <Button type="submit" loading={pending}>
            {editing ? "Save changes" : "Save measurement"}
          </Button>
          {editing ? (
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel edit
            </Button>
          ) : null}
        </div>
      </form>

      <section aria-labelledby={`${formId}-history`} className="body-history">
        <h3 id={`${formId}-history`} className="body-form__title">History</h3>
        {entries.length === 0 ? (
          <p className="progress-note">No measurements yet. Log your first one above.</p>
        ) : (
          <div className="chart-frame__table-scroll" tabIndex={0} role="region" aria-label="Measurement history (scrollable)">
            <table className="chart-table num" data-testid="body-history">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Weight ({unitLabel(unit)})</th>
                  <th scope="col">Body fat</th>
                  <th scope="col">Method</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {entries.slice(0, 30).map((e) => (
                  <tr key={e.id}>
                    <th scope="row">{formatDate(e.localDate, true)}</th>
                    <td>{e.weightKg != null ? weightText(e.weightKg, unit) : "–"}</td>
                    <td>{e.bodyFatPct != null ? `${e.bodyFatPct}%` : "–"}</td>
                    <td>{e.bodyFatMethod ? (METHOD_LABEL[e.bodyFatMethod] ?? e.bodyFatMethod) : "–"}</td>
                    <td className="body-history__actions">
                      <button type="button" className="link link-hover" onClick={() => { setEditing(e); setValues(valuesOf(e, unit)); setNotice(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label={`Edit measurement from ${formatDate(e.localDate, true)}`}>
                        Edit
                      </button>
                      <button type="button" className="link link-hover body-history__delete" onClick={() => onDelete(e)} aria-label={`Delete measurement from ${formatDate(e.localDate, true)}`}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function NavyEstimate({ navy, selected, ready, needsHip, onUse }: { navy: number | null; selected: boolean; ready: boolean; needsHip: boolean; onUse: () => void }): ReactNode {
  if (!ready) {
    return <p className="progress-note">The tape estimate needs your sex and height: add them in Settings / Profile.</p>;
  }
  return (
    <div className="navy-estimate" role="status" aria-live="polite">
      {navy != null ? (
        <>
          <p className="navy-estimate__value">
            US Navy tape estimate: <strong className="num" data-testid="navy-result">{navy}%</strong>
          </p>
          {selected ? (
            <p className="progress-note">Saved as the body fat for this measurement (recalculated on the server).</p>
          ) : (
            <Button type="button" variant="ink" onClick={onUse}>Use this estimate</Button>
          )}
        </>
      ) : (
        <p className="progress-note">
          Enter neck and waist{needsHip ? " and hip" : ""} to get a US Navy tape estimate. It is typically within a few percentage points of other methods.
        </p>
      )}
    </div>
  );
}
