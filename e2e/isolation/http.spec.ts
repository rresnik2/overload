// Two-user isolation over HTTP against a real server (stream W3). User A attacks with user B's ids: route handlers, pages, the account
// export and Better Auth's own endpoints. Logic-level coverage of every query/action/sync path is src/server/isolation.integration.test.ts;
// the full surface list is docs/security-checklist.md.
import { expect, test } from "@playwright/test";
import { newId } from "@/lib/ids";
import { testDb } from "../_support/db";
import { newMember, mutation, origin, push, seedViaSync, type Ids, type Member } from "./_pair";

test.describe.configure({ timeout: 180_000 });

const suffix = Date.now().toString(36);
let a: Member;
let b: Member;
let ids: Ids;
let secrets: Awaited<ReturnType<typeof seedViaSync>>["secrets"];

test.beforeAll(async ({ browser }) => {
  a = await newMember(browser, "iso-a");
  b = await newMember(browser, "iso-b");
  ({ ids, secrets } = await seedViaSync(b, suffix));
});
test.afterAll(async () => {
  await a?.context.close();
  await b?.context.close();
});

const bodyOf = async (page: Member["page"], path: string) => {
  const res = await page.request.get(path);
  return { status: res.status(), text: await res.text() };
};
const expectNoSecrets = (text: string, what: string, withIds = true) => {
  for (const value of [...Object.values(secrets), ...(withIds ? Object.values(ids) : [])]) expect(text, `${what} leaks ${value}`).not.toContain(value);
};

test("anonymous callers get 401 from every route handler and a redirect from every app page", async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL });
  expect((await anon.post("/api/sync", { headers: { origin: origin() }, data: {} })).status()).toBe(401);
  expect((await anon.get("/api/catalog")).status()).toBe(401);
  expect((await anon.get("/settings/account/export", { maxRedirects: 0 })).status()).toBeGreaterThanOrEqual(300);
  expect((await anon.get("/api/sync/gc")).status()).toBe(401);
  expect((await anon.get("/api/cron/insights")).status()).toBe(401);
  expect((await anon.get("/api/cron/insights", { headers: { authorization: "Bearer wrong-secret-wrong-secret" } })).status()).toBe(401);
  for (const path of ["/today", "/workout", "/history", `/history/${ids.workout}`, "/exercises", `/exercises/${ids.exercise}`, "/templates", `/templates/${ids.template}`, "/progress", `/progress/${ids.exercise}`, "/progress/body", "/progress/prs", "/insights", "/insights/2026-10-05", "/settings/profile", "/settings/security", "/settings/account"]) {
    const res = await anon.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBeGreaterThanOrEqual(300);
    expect(res.status(), path).toBeLessThan(400);
    expect(res.headers().location, path).toMatch(/\/sign-in/);
  }
  await anon.dispose();
});

test("A's sync pushes against B's ids are all NOT_OWNER and B's data is unchanged", async () => {
  const attack = Object.entries(ids).flatMap(([entity, id]) => [
    mutation(entity, id, entity === "workoutSet" ? { reps: 99 } : entity === "bodyMetric" ? { weightKg: 99 } : entity === "workout" ? { notes: "hijacked" } : entity === "templateExercise" ? { workingSets: 9 } : entity === "workoutExercise" ? { notes: "hijacked" } : { name: "hijacked" }, "e2eatk"),
    mutation(entity, id, { deletedAt: new Date().toISOString() }, "e2eatk"),
  ]);
  const res = await push(a.page, attack, 0, "e2eatk");
  expect(res.status).toBe(200);
  const body = res.body as { results: { status: string; reason?: string }[]; changes: Record<string, { id: string }[]> };
  expect(body.results.map((r) => `${r.status}:${r.reason}`)).toEqual(Array(attack.length).fill("rejected:NOT_OWNER"));
  expectNoSecrets(JSON.stringify(body.changes), "A's sync response");

  // B pulls from scratch: everything is as seeded, nothing tombstoned.
  const pull = await push(b.page, [], 0, "e2eb");
  const rows = (pull.body as { changes: Record<string, { id: string; deletedAt: string | null; notes?: string; reps?: number; name?: string }[]> }).changes;
  for (const [entity, id] of Object.entries(ids)) {
    const row = rows[entity]?.find((r) => r.id === id);
    expect(row, `${entity} survives`).toBeTruthy();
    expect(row?.deletedAt, `${entity} not tombstoned`).toBeNull();
  }
  expect(rows.workoutSet?.[0]?.reps).toBe(5);
  expect(rows.workout?.[0]?.notes).toBe(secrets.workoutNotes);
  expect(rows.exercise?.[0]?.name).toBe(secrets.exercise);
});

test("A's sync pull, catalog and export carry none of B's data (and B's carry B's)", async () => {
  expectNoSecrets(JSON.stringify((await push(a.page, [], 0, "e2eatk")).body), "A's cursor-0 pull");
  const catalog = await bodyOf(a.page, "/api/catalog");
  expect(catalog.status).toBe(200);
  expectNoSecrets(catalog.text, "/api/catalog");
  const exportA = await bodyOf(a.page, "/settings/account/export");
  expect(exportA.status).toBe(200);
  expectNoSecrets(exportA.text, "A's account export");
  const exportB = await bodyOf(b.page, "/settings/account/export");
  expect(exportB.text).toContain(secrets.workoutNotes);
  expect(exportB.text).toContain(secrets.exercise);
});

test("A cannot open B's records by URL: exercise, progress series, workout and template pages", async () => {
  for (const path of [`/exercises/${ids.exercise}`, `/progress/${ids.exercise}`]) {
    const res = await a.page.request.get(path);
    expect(res.status(), path).toBe(404);
    expectNoSecrets(await res.text(), path, false); // the 404 page echoes the requested URL, which is A's own input
  }
  await a.page.goto(`/history/${ids.workout}`);
  await expect(a.page.getByText("Workout not found")).toBeVisible({ timeout: 30_000 });
  await a.page.goto(`/templates/${ids.template}`);
  await expect(a.page.getByText("Template not found")).toBeVisible({ timeout: 30_000 });
  expectNoSecrets(await a.page.content(), "A's template page", false);
  expect((await a.page.request.get("/insights/2026-10-05")).status()).toBe(404); // A has no report for that week (B's weeks are addressable only by their owner)
  for (const path of ["/progress", "/progress/prs", "/progress/body", "/insights", "/exercises", "/today"]) {
    const res = await a.page.request.get(path);
    expectNoSecrets(await res.text(), path);
  }
});

test("Better Auth endpoints are scoped to the caller: A cannot revoke B's session or delete B's passkey", async () => {
  const prisma = await testDb();
  const userB = await prisma.user.findUniqueOrThrow({ where: { email: b.email } });
  const userA = await prisma.user.findUniqueOrThrow({ where: { email: a.email } });
  const sessionB = await prisma.session.findFirstOrThrow({ where: { userId: userB.id } });
  const passkeyId = newId();
  await prisma.passkey.create({ data: { id: passkeyId, name: "b-key", userId: userB.id, publicKey: "x", credentialID: `cred-${suffix}`, counter: 0, deviceType: "singleDevice", backedUp: false } });

  const headers = { origin: origin() };
  const sessions = await a.page.request.get("/api/auth/list-sessions");
  expect(JSON.stringify(await sessions.json())).not.toContain(sessionB.token);

  // The endpoints exist (never a 404): they answer, and refuse.
  const attempts = [
    await a.page.request.post("/api/auth/revoke-session", { headers, data: { token: sessionB.token } }),
    await a.page.request.post("/api/auth/passkey/delete-passkey", { headers, data: { id: passkeyId } }),
    await a.page.request.post("/api/auth/passkey/update-passkey", { headers, data: { id: passkeyId, name: "hijacked" } }),
  ];
  for (const res of attempts) expect(res.status(), res.url()).not.toBe(404);
  await a.page.request.post("/api/auth/revoke-other-sessions", { headers, data: {} });

  expect(await prisma.session.count({ where: { id: sessionB.id } }), "B's session row survives").toBe(1);
  const key = await prisma.passkey.findUnique({ where: { id: passkeyId } });
  expect(key?.name, "B's passkey is untouched").toBe("b-key");
  expect(await prisma.session.count({ where: { userId: userA.id } }), "A keeps its own session").toBeGreaterThan(0);
  // B is still signed in.
  expect((await b.page.request.get("/api/catalog")).status()).toBe(200);
  await prisma.passkey.delete({ where: { id: passkeyId } });
});
