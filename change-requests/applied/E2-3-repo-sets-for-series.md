# E2-3: `repo.sets.forSeries(seriesKey)` for live PR detection (stream E1 / frozen contract)

**What.** Add to `Repo["sets"]` in `src/contracts/repo.ts` (and the Dexie implementation in `src/client/repo/repo.ts`):

```ts
/** Every live (non-deleted) set of one progression series, any workout, unordered. Index: workoutSet.seriesKey. */
forSeries(seriesKey: string): Promise<WorkoutSetRow[]>;
```

**Why.** The live PR toast (`detectNewPrs(history, newSet)`) needs the series' whole history. The repo has no per-series read (only `lastTime`, per workout, per exercise), and walking every workout to rebuild a series is O(all sets) on each completed set.

**Workaround.** `src/components/workout/prs.ts` reads `requireActiveDb().workoutSet.where("seriesKey").equals(key)` (read only, still Dexie, never the network, never a write). Swap it for `repo.sets.forSeries` once the method exists.
