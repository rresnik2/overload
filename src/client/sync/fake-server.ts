// An in-memory stand-in for /api/sync and /api/catalog, used by the client tests (fake-indexeddb). It implements the
// protocol with the SAME shared merge code as the real server (per-field LWW by HLC, one version per row write,
// derived set columns, cursor paging, gc floor / reset, per-mutation rejection) but none of the database parts.
import { ENTITY_FIELDS_SCHEMAS, ENTITY_NAMES, ENTITY_REFS, SYNC_ORDER, type EntityName } from "@/contracts/entities";
import { emptyChanges, type Mutation, type MutationResult, type SyncRequest, type SyncResponse } from "@/contracts/sync";
import type { CatalogResponse } from "@/contracts/catalog";
import { deriveSetColumns } from "@/lib/sync/derive";
import { createHlcClock, clampHlc } from "@/lib/sync/hlc";
import { emptyMergeState, mergeFields, rowHlc } from "@/lib/sync/merge";

type Row = Record<string, unknown> & { id: string; version: number; fieldHlc: Record<string, string>; hlc: string; deletedAt: string | null };

export class FakeServer {
  readonly tables = new Map<EntityName, Map<string, Row>>(ENTITY_NAMES.map((e) => [e, new Map()]));
  version = 0;
  gcFloor = 0;
  pageSize = 1000;
  signedOut = false;
  offline = false;
  failNext: number | null = null;
  catalog: CatalogResponse | null = null;
  readonly requests: SyncRequest[] = [];
  catalogRequests: { ifNoneMatch: string | null }[] = [];
  /** Mutation ids to reject (simulates a server-side rule the client cannot see). */
  rejectIds = new Set<string>();
  private clock = createHlcClock({ nodeId: "server" });

  rows(entity: EntityName): Row[] {
    return [...(this.tables.get(entity) as Map<string, Row>).values()];
  }
  row(entity: EntityName, id: string): Row | undefined {
    return this.tables.get(entity)?.get(id);
  }

  /** Delete tombstones up to the current version and raise the floor (what GC does). */
  gc(): void {
    this.gcFloor = this.version;
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (this.offline) throw new TypeError("Failed to fetch");
    const url = String(input);
    if (url.endsWith("/api/catalog")) return this.handleCatalog(init);
    if (this.signedOut) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (this.failNext) {
      const status = this.failNext;
      this.failNext = null;
      return Response.json({ error: "boom" }, { status });
    }
    return Response.json(this.sync(JSON.parse(String(init?.body)) as SyncRequest));
  };

  private handleCatalog(init?: RequestInit): Response {
    const headers = new Headers(init?.headers);
    this.catalogRequests.push({ ifNoneMatch: headers.get("if-none-match") });
    if (!this.catalog) return Response.json({ error: "not implemented" }, { status: 501 });
    const etag = `W/"catalog-${this.catalog.version}"`;
    if (headers.get("if-none-match") === etag) return new Response(null, { status: 304 });
    return new Response(JSON.stringify(this.catalog), { status: 200, headers: { etag, "content-type": "application/json" } });
  }

  private exists(entity: EntityName, id: string): boolean {
    if (entity === "exercise" && this.catalog?.exercises.some((e) => e.id === id)) return true;
    return this.row(entity, id) !== undefined;
  }

  private derive(set: Row): object | null {
    const we = this.row("workoutExercise", set.workoutExerciseId as string);
    const workout = we && this.row("workout", we.workoutId as string);
    const exercise = we && (this.row("exercise", we.exerciseId as string) ?? this.catalog?.exercises.find((e) => e.id === we.exerciseId));
    if (!we || !workout || !exercise) return null;
    return deriveSetColumns({
      set: set as never,
      workoutExercise: we as never,
      workout: workout as never,
      exercise: exercise as never,
      machineProfile: we.machineProfileId ? (this.row("machineProfile", we.machineProfileId as string) as never) : null,
      fallbackBodyweightKg: null,
    });
  }

  sync(request: SyncRequest): SyncResponse {
    this.requests.push(request);
    const nowMs = Date.now();
    const results: MutationResult[] = new Array(request.mutations.length);
    const order = request.mutations.map((m, index) => ({ m, index })).sort((a, b) => SYNC_ORDER.indexOf(a.m.entity) - SYNC_ORDER.indexOf(b.m.entity));

    for (const { m, index } of order) {
      const reject = (message: string): void => {
        results[index] = { mutationId: m.mutationId, status: "rejected", reason: "INVALID_SHAPE", message };
      };
      if (this.rejectIds.has(m.mutationId)) {
        reject("rejected by test");
        continue;
      }
      const table = this.tables.get(m.entity) as Map<string, Row>;
      const existing = table.get(m.id);
      const fieldHlc = Object.fromEntries(Object.entries(m.fieldHlc).map(([f, h]) => [f, clampHlc(h, nowMs)]));
      const { state, changed } = mergeFields(
        existing ? { values: { ...existing }, fieldHlc: { ...existing.fieldHlc } } : emptyMergeState(),
        { fields: m.fields as Record<string, unknown>, fieldHlc },
      );
      if (changed.length === 0 && existing) {
        results[index] = { mutationId: m.mutationId, status: "noop" };
        continue;
      }
      let values = state.values;
      if (!existing) {
        const { deletedAt, ...writable } = values;
        const parsed = ENTITY_FIELDS_SCHEMAS[m.entity].safeParse(writable);
        if (!parsed.success) {
          reject(parsed.error.message);
          continue;
        }
        values = { ...parsed.data, deletedAt: deletedAt ?? null };
      }
      const missing = ENTITY_REFS[m.entity].find((r) => typeof values[r.field] === "string" && !this.exists(r.entity, values[r.field] as string));
      if (missing) {
        results[index] = { mutationId: m.mutationId, status: "rejected", reason: "MISSING_REFERENCE", message: missing.field };
        continue;
      }
      const row = { ...(existing ?? {}), ...values, id: m.id, fieldHlc: state.fieldHlc, hlc: rowHlc(state.fieldHlc), version: ++this.version } as Row;
      if (m.entity === "exercise") Object.assign(row, { isCustom: true, sourceId: null });
      if (m.entity === "workoutSet") Object.assign(row, this.derive(row) ?? {});
      row.createdAt ??= new Date(nowMs).toISOString();
      row.updatedAt = new Date(nowMs).toISOString();
      table.set(m.id, row);
      results[index] = { mutationId: m.mutationId, status: "applied" };
    }

    const reset = request.cursor > 0 && request.cursor < this.gcFloor;
    const all = ENTITY_NAMES.flatMap((entity) => this.rows(entity).filter((r) => r.version > request.cursor).map((row) => ({ entity, row })))
      .sort((a, b) => a.row.version - b.row.version);
    const page = reset ? [] : all.slice(0, this.pageSize);
    const hasMore = reset || all.length > page.length;
    const changes = emptyChanges();
    for (const { entity, row } of page) (changes[entity] as unknown as Row[]).push(row);
    return {
      results,
      changes,
      newPrs: [],
      cursor: reset ? 0 : hasMore ? (page.at(-1) as { row: Row }).row.version : this.version,
      hasMore,
      reset,
      serverTime: new Date(nowMs).toISOString(),
      serverHlc: this.clock.receive(request.clientHlc),
    };
  }
}

export type { Mutation };
