// In-memory ReportStore for the pipeline unit tests. Mirrors the claim semantics of the Prisma store
// (atomic cap check, one claim per fresh PENDING report) without a database.
import { InsightStatus, InsightTrigger } from "@/contracts/enums";
import type { InsightReportRow } from "@/contracts/insights";
import { PENDING_STALE_MS } from "./constants";
import type { BeginResult, FinishData, ReportStore, StoredReport } from "./reports";

interface Entry {
  id: string;
  weekStart: string;
  status: InsightStatus;
  onDemandCount: number;
  updatedAt: Date;
  data: FinishData | null;
  generatedAt: Date | null;
}

export function createMemoryStore(opts: { timezone?: string | null; now?: () => Date } = {}) {
  const now = opts.now ?? (() => new Date());
  const entries = new Map<string, Entry>();
  let seq = 0;

  const rowOf = (e: Entry): InsightReportRow | null =>
    e.data && {
      id: e.id, weekStart: e.weekStart, status: e.status, trigger: e.data.trigger, factsVersion: 1, facts: e.data.facts, factsHash: e.data.factsHash,
      narrative: e.data.narrative, model: e.data.model, promptVersion: e.data.promptVersion, inputTokens: e.data.inputTokens, outputTokens: e.data.outputTokens,
      error: e.data.error, onDemandCount: e.onDemandCount, generatedAt: e.generatedAt ? e.generatedAt.toISOString() : null,
    };
  const stored = (e: Entry): StoredReport => ({ id: e.id, status: e.status, factsHash: e.data?.factsHash ?? "", onDemandCount: e.onDemandCount, updatedAt: e.updatedAt, row: rowOf(e) });

  const store: ReportStore = {
    async timezoneOf() {
      return opts.timezone === undefined ? "America/New_York" : opts.timezone;
    },
    async find(_ctx, weekStart) {
      const e = entries.get(weekStart);
      return e ? stored(e) : null;
    },
    async begin(_ctx, { weekStart, trigger, facts, factsHash, maxOnDemand, now: at }): Promise<BeginResult> {
      const onDemand = trigger === InsightTrigger.ON_DEMAND;
      const e = entries.get(weekStart);
      if (!e) {
        const entry: Entry = { id: `r${++seq}`, weekStart, status: InsightStatus.PENDING, onDemandCount: onDemand ? 1 : 0, updatedAt: at, generatedAt: null, data: { facts, factsHash, trigger, narrative: null, model: null, promptVersion: null, inputTokens: null, outputTokens: null, error: null, status: InsightStatus.FAILED } };
        entries.set(weekStart, entry);
        return { ok: true, id: entry.id };
      }
      if (e.status === InsightStatus.PENDING && at.getTime() - e.updatedAt.getTime() < PENDING_STALE_MS) return { ok: false, reason: "in_progress" };
      if (onDemand && e.onDemandCount >= maxOnDemand) return { ok: false, reason: "rate_limited" };
      e.status = InsightStatus.PENDING;
      e.updatedAt = at;
      if (onDemand) e.onDemandCount += 1;
      return { ok: true, id: e.id };
    },
    async finish(_ctx, id, data) {
      const e = [...entries.values()].find((x) => x.id === id)!;
      Object.assign(e, { status: data.status, data, updatedAt: now(), generatedAt: now() });
      return rowOf(e)!;
    },
    async save(_ctx, { weekStart, ...data }) {
      const e = entries.get(weekStart) ?? { id: `r${++seq}`, weekStart, status: data.status, onDemandCount: 0, updatedAt: now(), data: null, generatedAt: null };
      Object.assign(e, { status: data.status, data, updatedAt: now(), generatedAt: now() });
      entries.set(weekStart, e);
      return rowOf(e)!;
    },
  };
  return { store, entries };
}
