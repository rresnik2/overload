import "server-only";
// State shared by the steps of one sync transaction (apply -> orphan rule -> dependent re-derive -> PR rebuild).
import type { EntityName } from "@/contracts/entities";
import { createHlcClock, type HlcClock } from "@/lib/sync/hlc";
import type { FieldValues } from "@/lib/sync/merge";
import type { UserCtx } from "@/server/auth/ctx";
import { SetDeriver } from "./derive";
import type { Tx } from "./entities";

/** A row this batch wrote (created or changed). */
export interface TouchedRow {
  entity: EntityName;
  id: string;
  isNew: boolean;
  changed: ReadonlySet<string>;
  values: FieldValues;
}

export class Batch {
  readonly touched: TouchedRow[] = [];
  /** Series whose sets changed (old and new keys): their PRs are rebuilt at the end. */
  readonly seriesKeys = new Set<string>();
  readonly deriver: SetDeriver;
  /** Server clock used to mint HLCs for server-initiated writes (orphan tombstones). */
  readonly clock: HlcClock;
  private version: number;

  constructor(
    readonly tx: Tx,
    readonly ctx: UserCtx,
    readonly nowMs: number,
    startVersion: number,
  ) {
    this.version = startVersion;
    this.deriver = new SetDeriver(tx, ctx);
    this.clock = createHlcClock({ nodeId: "server", now: () => nowMs });
  }

  /** Every row write gets its own version, so cursor paging can never split rows that share one. */
  nextVersion(): number {
    this.version += 1;
    return this.version;
  }

  get currentVersion(): number {
    return this.version;
  }

  touchedOf(entity: EntityName): TouchedRow[] {
    return this.touched.filter((t) => t.entity === entity);
  }
}
