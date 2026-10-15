// Shared setup for the two-user isolation specs: users A and B in separate browser contexts, and B's data pushed through the real
// POST /api/sync route handler (so B has one of every entity, with PRs and an insight-free history).
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { favoriteId, newId } from "@/lib/ids";
import { createUser, type Credentials } from "../_support/user";

export const origin = () => new URL(process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).origin;

export interface Member extends Credentials {
  context: BrowserContext;
  page: Page;
}

export async function newMember(browser: Browser, tag: string): Promise<Member> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const creds = await createUser(page, { tag, name: tag });
  return { ...creds, context, page };
}

let counter = 0;
const hlc = (node: string) => `${String(Date.now()).padStart(15, "0")}-${(counter++).toString(16).padStart(5, "0")}-${node}`;

export interface Mutation {
  mutationId: string;
  entity: string;
  id: string;
  fields: Record<string, unknown>;
  fieldHlc: Record<string, string>;
}
export const mutation = (entity: string, id: string, fields: Record<string, unknown>, node = "e2edev"): Mutation => {
  const stamp = hlc(node);
  return { mutationId: newId(), entity, id, fields, fieldHlc: Object.fromEntries(Object.keys(fields).map((f) => [f, stamp])) };
};

export async function push(page: Page, mutations: Mutation[], cursor = 0, node = "e2edev") {
  const res = await page.request.post("/api/sync", { headers: { origin: origin() }, data: { deviceId: node, cursor, clientHlc: hlc(node), mutations } });
  return { status: res.status(), body: res.ok() ? await res.json() : await res.text() };
}

export const SECRET = (suffix: string) => ({
  exercise: `ZZ-B-secret-press-${suffix}`,
  machine: `ZZ-B-secret-machine-${suffix}`,
  template: `ZZ-B-secret-template-${suffix}`,
  workoutNotes: `ZZ-B-secret-notes-${suffix}`,
});

export type Ids = Record<"exercise" | "machineProfile" | "bodyMetric" | "template" | "templateExercise" | "workout" | "workoutExercise" | "workoutSet" | "exerciseFavorite", string>;

/** One of every entity for `member`, with secret strings, through the sync route. */
export async function seedViaSync(member: Member, suffix: string): Promise<{ ids: Ids; secrets: ReturnType<typeof SECRET> }> {
  const s = SECRET(suffix);
  // A favorite's id is derived from (user, exercise), so the seeding user's id is needed: ask the session endpoint.
  const session = (await (await member.page.request.get("/api/auth/get-session")).json()) as { user: { id: string } };
  const exercise = newId();
  const ids: Ids = { exercise, machineProfile: newId(), bodyMetric: newId(), template: newId(), templateExercise: newId(), workout: newId(), workoutExercise: newId(), workoutSet: newId(), exerciseFavorite: favoriteId(session.user.id, exercise) };
  const today = new Date().toISOString().slice(0, 10);
  const res = await push(member.page, [
    mutation("exercise", ids.exercise, { slug: `zz-${suffix}`, name: s.exercise, modality: "FREE_WEIGHT", equipment: "BARBELL", loadType: "TOTAL" }),
    mutation("machineProfile", ids.machineProfile, { name: s.machine, exerciseId: ids.exercise }),
    mutation("bodyMetric", ids.bodyMetric, { measuredAt: `${today}T08:00:00.000Z`, localDate: today, weightKg: 80 }),
    mutation("template", ids.template, { name: s.template, position: "a0" }),
    mutation("templateExercise", ids.templateExercise, { templateId: ids.template, exerciseId: ids.exercise, position: "a0" }),
    mutation("workout", ids.workout, { startedAt: `${today}T17:00:00.000Z`, localDate: today, timezone: "UTC", notes: s.workoutNotes }),
    mutation("workoutExercise", ids.workoutExercise, { workoutId: ids.workout, exerciseId: ids.exercise, position: "a0" }),
    mutation("workoutSet", ids.workoutSet, { workoutExerciseId: ids.workoutExercise, position: "a0", setType: "WORKING", weightKg: 100, reps: 5, rir: 0, completedAt: `${today}T17:10:00.000Z` }),
    mutation("exerciseFavorite", ids.exerciseFavorite, { exerciseId: ids.exercise, position: "a0" }),
  ]);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  expect((res.body as { results: { status: string; message?: string }[] }).results.map((r) => r.message ?? r.status)).toEqual(Array(9).fill("applied"));
  return { ids, secrets: s };
}
