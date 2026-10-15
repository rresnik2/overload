// Two-user isolation suite (stream W3). Needs a migrated database: pnpm test:integration. Checklist: docs/security-checklist.md.
//
// User B owns a full data set (every synced entity, PRs, an insight report, a profile). User A (the attacker) then calls every
// query, Server Action logic function and sync path with B's ids. Every call must fail (NOT_OWNER / MISSING_REFERENCE / not found /
// ok:false) or return nothing of B's, and B's rows must be byte-identical afterwards.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ENTITY_NAMES, type EntityName } from "@/contracts/entities";
import { InsightStatus, InsightTrigger } from "@/contracts/enums";
import { newId } from "@/lib/ids";
import { mintUserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { addBodyMetric, deleteBodyMetric, editBodyMetric } from "@/server/actions/body.logic";
import { loadInsightsOverview } from "@/server/insights/current";
import { latestReport, listReports, prismaReportStore } from "@/server/insights/reports";
import { rebuildSeriesPrs } from "@/server/prs/rebuild";
import { getExerciseDetail, listLibrary, loadCatalog } from "@/server/catalog/queries";
import { deleteAccount } from "@/server/profile/delete-account";
import { exportAccountData } from "@/server/profile/export";
import { completeOnboarding } from "@/server/profile/onboarding";
import { getProfileRow, updateProfile } from "@/server/profile/profile";
import { loadBodyView } from "@/server/queries/body";
import { loadBodyFacts, loadSetFacts } from "@/server/queries/facts";
import { loadExerciseProgress, loadProgressOverview } from "@/server/queries/progress";
import { loadPrBoard } from "@/server/queries/prs";
import { applySyncSlots } from "@/server/sync/apply";
import { parseSyncBody } from "@/server/sync/parse";
import { pullChanges } from "@/server/sync/pull";
import { FakeDevice, exerciseFields, setFields, workoutFields } from "@/server/sync/test-helpers";

// deleteAccount reads the request headers and asks Better Auth who is calling: both are faked, the session is whatever the test sets.
const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/auth/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({ user: { id: session.userId }, session: { createdAt: new Date() } }),
      verifyPassword: async () => {
        throw new Error("no credential account in these tests");
      },
      signOut: async () => undefined,
    },
  },
}));

const suffix = newId().slice(-12);
const userA = `iso-a-${suffix}`;
const userB = `iso-b-${suffix}`;
const userC = `iso-c-${suffix}`; // deleted in the account-deletion test
const ctxA = mintUserCtx(userA);
const ctxB = mintUserCtx(userB);
const users = [userA, userB, userC];

/** Strings that only B's data contains: if one shows up in anything A receives, B's data leaked. */
const SECRET = {
  exercise: `ZZ-B-secret-press-${suffix}`,
  machine: `ZZ-B-secret-machine-${suffix}`,
  template: `ZZ-B-secret-template-${suffix}`,
  workoutNotes: `ZZ-B-secret-notes-${suffix}`,
  bodyNotes: `ZZ-B-secret-body-${suffix}`,
  narrative: `ZZ-B-secret-narrative-${suffix}`,
};

interface Tree {
  ids: Record<EntityName, string>;
  seriesKeys: string[];
}

const PROFILE = { sex: "MALE", heightCm: 180, timezone: "UTC", unitPreference: "KG", effortScale: "RIR", e1rmFormula: "EPLEY", defaultRestSec: 120 } as const;

/** One of every synced entity, pushed through the real sync path, so PRs and derived columns exist too. */
async function seedTree(ctx: typeof ctxA, tag: string, secrets: boolean): Promise<Tree> {
  const dev = new FakeDevice(ctx, `dev${tag}`);
  const ids = Object.fromEntries(ENTITY_NAMES.map((e) => [e, newId()])) as Record<EntityName, string>;
  const name = (kind: keyof typeof SECRET, fallback: string) => (secrets ? SECRET[kind] : `${fallback}-${tag}`);
  const res = await dev.push([
    dev.mutation("exercise", ids.exercise, exerciseFields({ slug: `iso-${tag}-${suffix}`, name: name("exercise", "Press") })),
    dev.mutation("machineProfile", ids.machineProfile, { name: name("machine", "Machine"), gymName: `Gym ${tag}`, exerciseId: ids.exercise }),
    dev.mutation("bodyMetric", ids.bodyMetric, { measuredAt: "2026-10-12T08:00:00.000Z", localDate: "2026-10-12", weightKg: 80, notes: name("bodyNotes", "body") }),
    dev.mutation("template", ids.template, { name: name("template", "Template"), position: "a0" }),
    dev.mutation("templateExercise", ids.templateExercise, { templateId: ids.template, exerciseId: ids.exercise, machineProfileId: ids.machineProfile, position: "a0" }),
    dev.mutation("workout", ids.workout, workoutFields({ notes: name("workoutNotes", "notes") })),
    dev.mutation("workoutExercise", ids.workoutExercise, { workoutId: ids.workout, exerciseId: ids.exercise, machineProfileId: ids.machineProfile, position: "a0" }),
    dev.mutation("workoutSet", ids.workoutSet, setFields(ids.workoutExercise, { weightKg: 100, reps: 5 })),
  ]);
  expect(res.results.map((r) => r.status), `${tag} tree`).toEqual(ENTITY_NAMES.map(() => "applied"));
  const sets = await prisma.workoutSet.findMany({ where: { userId: ctx.id }, select: { seriesKey: true } });
  return { ids, seriesKeys: [...new Set(sets.map((s) => s.seriesKey))] };
}

/** Every row a user owns, serialised: the "byte-identical" check. Catalog rows are shared and excluded. */
async function snapshot(userId: string): Promise<string> {
  const where = { userId };
  const rows = {
    user: await prisma.user.findMany({ where: { id: userId } }),
    profile: await prisma.profile.findMany({ where }),
    syncState: await prisma.syncState.findMany({ where }),
    deadLetters: await prisma.syncDeadLetter.findMany({ where, orderBy: { id: "asc" } }),
    exercise: await prisma.exercise.findMany({ where, include: { muscles: { orderBy: { muscle: "asc" } } }, orderBy: { id: "asc" } }),
    machineProfile: await prisma.machineProfile.findMany({ where, orderBy: { id: "asc" } }),
    bodyMetric: await prisma.bodyMetric.findMany({ where, orderBy: { id: "asc" } }),
    template: await prisma.template.findMany({ where, orderBy: { id: "asc" } }),
    templateExercise: await prisma.templateExercise.findMany({ where, orderBy: { id: "asc" } }),
    workout: await prisma.workout.findMany({ where, orderBy: { id: "asc" } }),
    workoutExercise: await prisma.workoutExercise.findMany({ where, orderBy: { id: "asc" } }),
    workoutSet: await prisma.workoutSet.findMany({ where, orderBy: { id: "asc" } }),
    personalRecord: await prisma.personalRecord.findMany({ where, orderBy: { id: "asc" } }),
    insightReport: await prisma.insightReport.findMany({ where, orderBy: { id: "asc" } }),
  };
  return JSON.stringify(rows);
}

let treeA: Tree;
let treeB: Tree;
let before: string;
let insightWeek = "";
let reportBId = "";

const bIds = () => Object.values(treeB.ids);
/** Assert nothing of B's is in `value`: not an id, not a secret string. */
function expectNoB(value: unknown, what: string) {
  const text = JSON.stringify(value ?? null);
  for (const id of bIds()) expect(text, `${what} contains B's id ${id}`).not.toContain(id);
  for (const secret of Object.values(SECRET)) expect(text, `${what} contains B's secret`).not.toContain(secret);
  for (const key of treeB.seriesKeys) expect(text, `${what} contains B's series ${key}`).not.toContain(key);
  expect(text, `${what} contains B's user id`).not.toContain(userB);
}

beforeAll(async () => {
  for (const id of users) await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
  for (const id of [userA, userB, userC]) await prisma.profile.create({ data: { userId: id, ...PROFILE, onboardedAt: new Date("2026-10-01T00:00:00Z") } });
  treeA = await seedTree(ctxA, "a", false);
  treeB = await seedTree(ctxB, "b", true);
  await seedTree(mintUserCtx(userC), "c", false);

  // B's insight report: rule facts from B's own data, a narrative that carries a secret.
  const overview = await loadInsightsOverview(ctxB, new Date("2026-10-15T12:00:00Z"));
  insightWeek = overview.weekStart;
  const row = await prismaReportStore.save(ctxB, {
    weekStart: insightWeek,
    status: InsightStatus.READY,
    trigger: InsightTrigger.ON_DEMAND,
    facts: (overview.current?.facts ?? overview.preview)!,
    factsHash: `hash-${suffix}`,
    narrative: { headline: SECRET.narrative, summary: "summary", sections: [{ title: "t", body: "b", factRefs: ["lifter"] }], actions: [] },
    model: "test",
    promptVersion: "test",
    inputTokens: 1,
    outputTokens: 1,
    error: null,
  });
  reportBId = row.id;
  before = await snapshot(userB);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

describe("controls: B's data is visible to B, so 'A sees nothing' is not vacuous", () => {
  it("B's own queries return B's rows", async () => {
    expect(JSON.stringify(await loadProgressOverview(ctxB, { today: "2026-10-15" }))).toContain(treeB.ids.exercise);
    expect(JSON.stringify(await loadPrBoard(ctxB))).toContain(treeB.ids.exercise);
    expect(JSON.stringify(await loadBodyView(ctxB, { today: "2026-10-15" }))).toContain("2026-10-12");
    expect(JSON.stringify(await getExerciseDetail(ctxB, treeB.ids.exercise))).toContain(SECRET.exercise);
    expect(JSON.stringify(await exportAccountData(ctxB))).toContain(SECRET.workoutNotes);
    expect(JSON.stringify(await listReports(ctxB))).toContain(SECRET.narrative);
    expect(JSON.stringify((await pullChanges(ctxB, 0)).changes)).toContain(treeB.ids.workoutSet);
  });
});

describe("sync: A writes to B's ids through the real handler logic", () => {
  const patch: Record<EntityName, Record<string, unknown>> = {
    exercise: { name: "Hijacked" },
    machineProfile: { name: "Hijacked" },
    bodyMetric: { weightKg: 99 },
    template: { name: "Hijacked" },
    templateExercise: { workingSets: 9 },
    workout: { notes: "Hijacked" },
    workoutExercise: { notes: "Hijacked" },
    workoutSet: { reps: 99 },
  };

  for (const entity of ENTITY_NAMES) {
    it(`${entity}: an update, a tombstone and an undelete of B's row are all NOT_OWNER`, async () => {
      const dev = new FakeDevice(ctxA, `atk${entity}`);
      const id = treeB.ids[entity];
      const res = await dev.push([
        dev.mutation(entity, id, patch[entity] as Record<string, unknown>),
        dev.mutation(entity, id, { deletedAt: new Date().toISOString() }),
        dev.mutation(entity, id, { deletedAt: null }),
      ]);
      expect(res.results.map((r) => r.status)).toEqual(["rejected", "rejected", "rejected"]);
      expect(res.results.every((r) => r.reason === "NOT_OWNER")).toBe(true);
      expectNoB(res.changes, `sync response for ${entity}`);
    });
  }

  it("creating rows whose parents are B's is MISSING_REFERENCE for every child entity", async () => {
    const dev = new FakeDevice(ctxA, "atkrefs");
    const a = treeA.ids;
    const b = treeB.ids;
    const res = await dev.push([
      dev.mutation("machineProfile", newId(), { name: "x", exerciseId: b.exercise }),
      dev.mutation("templateExercise", newId(), { templateId: b.template, exerciseId: a.exercise, position: "a1" }),
      dev.mutation("templateExercise", newId(), { templateId: a.template, exerciseId: b.exercise, position: "a2" }),
      dev.mutation("templateExercise", newId(), { templateId: a.template, exerciseId: a.exercise, machineProfileId: b.machineProfile, position: "a3" }),
      dev.mutation("workoutExercise", newId(), { workoutId: b.workout, exerciseId: a.exercise, position: "a1" }),
      dev.mutation("workoutExercise", newId(), { workoutId: a.workout, exerciseId: b.exercise, position: "a2" }),
      dev.mutation("workoutExercise", newId(), { workoutId: a.workout, exerciseId: a.exercise, machineProfileId: b.machineProfile, position: "a3" }),
      dev.mutation("workoutSet", newId(), setFields(b.workoutExercise)),
      dev.mutation("workout", newId(), workoutFields({ templateId: b.template })),
    ]);
    expect(res.results.map((r) => `${r.status}:${r.reason}`)).toEqual(Array(9).fill("rejected:MISSING_REFERENCE"));
    expectNoB(res.changes, "sync response");
  });

  it("a create that reuses B's id with a full valid row is NOT_OWNER, never an overwrite", async () => {
    const dev = new FakeDevice(ctxA, "atkcreate");
    const res = await dev.push([
      dev.mutation("workout", treeB.ids.workout, workoutFields({ notes: "stolen" })),
      dev.mutation("bodyMetric", treeB.ids.bodyMetric, { measuredAt: "2026-10-12T08:00:00.000Z", localDate: "2026-10-12", weightKg: 1 }),
    ]);
    expect(res.results.map((r) => r.reason)).toEqual(["NOT_OWNER", "NOT_OWNER"]);
  });

  it("forbidden fields (userId, version, seriesKey, e1rmKg...) in a body are dead-lettered for the caller only", async () => {
    const dev = new FakeDevice(ctxA, "atkforbidden");
    const poisoned = ["userId", "version", "hlc", "fieldHlc", "effectiveLoadKg", "e1rmKg", "seriesKey", "workoutId"].map((field) => ({
      ...dev.mutation("workoutSet", newId(), setFields(treeA.ids.workoutExercise)),
      fields: { ...setFields(treeA.ids.workoutExercise), [field]: field === "userId" ? userB : 1 },
    }));
    const parsed = parseSyncBody({ ...dev.request([]), mutations: poisoned });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const res = await applySyncSlots(ctxA, parsed.envelope, parsed.slots);
    expect(res.results.map((r) => r.reason)).toEqual(Array(poisoned.length).fill("INVALID_SHAPE"));
    expect(await prisma.syncDeadLetter.count({ where: { userId: userB } })).toBe(0);
  });

  it("pull: A's cursor-0 pull carries none of B's rows, and A's PR rebuild on B's series leaves B's PRs alone", async () => {
    const page = await pullChanges(ctxA, 0);
    expectNoB(page.changes, "pull(0)");
    for (const entity of ENTITY_NAMES) expect(page.changes[entity].length, entity).toBeGreaterThan(0); // A's own rows do arrive
    await prisma.$transaction((tx) => rebuildSeriesPrs(tx, ctxA, treeB.seriesKeys));
    expect(await prisma.personalRecord.count({ where: { userId: userA, seriesKey: { in: treeB.seriesKeys } } })).toBe(0);
  });
});

describe("queries: A asks for B's ids", () => {
  it("progress, exercise detail, PR board, body, insights and facts contain nothing of B's", async () => {
    expect(await loadExerciseProgress(ctxA, treeB.ids.exercise)).toBeNull();
    expect(await loadExerciseProgress(ctxA, treeB.ids.exercise, { seriesKey: treeB.seriesKeys[0] })).toBeNull();
    expect(await getExerciseDetail(ctxA, treeB.ids.exercise)).toBeNull();
    expectNoB(await loadProgressOverview(ctxA, { today: "2026-10-15" }), "loadProgressOverview");
    expectNoB(await loadPrBoard(ctxA), "loadPrBoard");
    expectNoB(await loadBodyView(ctxA, { today: "2026-10-15" }), "loadBodyView");
    expectNoB(await loadSetFacts(ctxA, { from: "2026-01-01", to: "2026-12-31" }), "loadSetFacts");
    expectNoB(await loadBodyFacts(ctxA, { from: "2026-01-01", to: "2026-12-31" }), "loadBodyFacts");
    expectNoB(await loadInsightsOverview(ctxA, new Date("2026-10-15T12:00:00Z")), "loadInsightsOverview");
    expect(await getProfileRow(ctxA)).not.toMatchObject({ userId: userB });
  });

  it("the library and catalog never include B's custom exercise, even when searched by its exact name", async () => {
    expect((await listLibrary(ctxA, { text: SECRET.exercise })).exercises).toEqual([]);
    expectNoB((await listLibrary(ctxA, { pageSize: 500 })).exercises.filter((e) => e.isCustom), "listLibrary custom rows");
    const catalog = await loadCatalog(1);
    expect(catalog.exercises.every((e) => !e.isCustom)).toBe(true);
    expectNoB(catalog.exercises.filter((e) => e.name.startsWith("ZZ-") || e.id === treeB.ids.exercise), "loadCatalog");
  });

  it("insight reports: A's list, latest and week lookup have none of B's, and A cannot finish B's report", async () => {
    expectNoB(await listReports(ctxA), "listReports");
    expectNoB(await latestReport(ctxA), "latestReport");
    expect(await prismaReportStore.find(ctxA, insightWeek)).toBeNull();
    await expect(
      prismaReportStore.finish(ctxA, reportBId, {
        status: InsightStatus.READY,
        trigger: InsightTrigger.ON_DEMAND,
        facts: (await loadInsightsOverview(ctxA, new Date("2026-10-15T12:00:00Z"))).preview!,
        factsHash: "x",
        narrative: null,
        model: "attacker",
        promptVersion: "x",
        inputTokens: 0,
        outputTokens: 0,
        error: null,
      }),
    ).rejects.toThrow();
  });

  it("A's account export contains none of B's data", async () => {
    const exported = await exportAccountData(ctxA);
    expectNoB(exported, "exportAccountData");
    expect(exported.account.email).toBe(`${userA}@example.test`);
  });
});

describe("Server Action logic: A acts on B's ids", () => {
  it("body metrics: edit and delete of B's row fail; add with an injected userId fails", async () => {
    const edit = await editBodyMetric(ctxA, { id: treeB.ids.bodyMetric, fields: { localDate: "2026-10-12", weightKg: 1 } });
    expect(edit).toMatchObject({ ok: false });
    expect(await deleteBodyMetric(ctxA, { id: treeB.ids.bodyMetric })).toMatchObject({ ok: false });
    expect(await addBodyMetric(ctxA, { localDate: "2026-10-14", weightKg: 80, userId: userB })).toMatchObject({ ok: false });
  });

  it("profile and onboarding: an injected userId is rejected and B's profile is untouched", async () => {
    expect(await updateProfile(ctxA, { ...PROFILE, userId: userB, heightCm: 1 })).toMatchObject({ ok: false });
    expect(await completeOnboarding(ctxA, { userId: userB })).toMatchObject({ ok: false });
    expect(Number((await getProfileRow(ctxB))?.heightCm)).toBe(180);
  });

  it("account deletion: a session that is not the caller's is refused; deleting C removes only C", async () => {
    session.userId = userB; // Better Auth says the cookie belongs to B while the ctx is A's
    expect(await deleteAccount(ctxA, { confirmation: "delete my account" })).toMatchObject({ ok: false });
    expect(await prisma.user.count({ where: { id: userA } })).toBe(1);

    const ctxC = mintUserCtx(userC);
    session.userId = userC;
    expect(await deleteAccount(ctxC, { confirmation: "delete my account" })).toEqual({ ok: true });
    expect(await prisma.user.count({ where: { id: userC } })).toBe(0);
    expect(await prisma.workoutSet.count({ where: { userId: userC } })).toBe(0);
    expect(await prisma.exercise.count({ where: { userId: null } })).toBeGreaterThan(0); // the shared catalog survives
  });
});

describe("the end state", () => {
  it("B's data is byte-identical to before every attack (rows, versions, HLCs, PRs, report, profile, dead letters)", async () => {
    expect(await snapshot(userB)).toBe(before);
  });
});
