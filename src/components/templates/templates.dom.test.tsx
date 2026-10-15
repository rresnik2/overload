import "fake-indexeddb/auto";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { activateUserDb, resetAllDbs } from "@/client/db/active";
import { repo } from "@/client/repo";
import { TodayTemplatesCard } from "@/components/today/TodayTemplatesCard";
import { exerciseInput } from "@/client/repo/test-utils";
import { TemplatesView } from "./TemplatesView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/templates" }));

const original = { showModal: HTMLDialogElement.prototype.showModal, close: HTMLDialogElement.prototype.close };
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterAll(() => {
  HTMLDialogElement.prototype.showModal = original.showModal;
  HTMLDialogElement.prototype.close = original.close;
});
beforeEach(() => {
  activateUserDb("user-1");
  push.mockClear();
});
afterEach(async () => {
  await resetAllDbs();
});

async function seedTemplate(name: string, position: string) {
  const bench = await repo.exercises.create(exerciseInput({ slug: `bench-${position}`, name: `Bench ${position}` }));
  const t = await repo.templates.create({ name, position });
  await repo.templateExercises.create({ templateId: t.id, exerciseId: bench.id, position: "a0", workingSets: 3 });
  return t;
}

describe("TemplatesView actions", () => {
  it("offers New, Start, Edit, Duplicate and Delete, and duplicating adds a copy", async () => {
    const user = userEvent.setup();
    await seedTemplate("Push", "a0");
    render(<TemplatesView />);
    expect(await screen.findByRole("button", { name: "New template" })).toBeInTheDocument();
    for (const action of ["Start Push", "Edit Push", "Duplicate Push", "Delete Push"]) expect(screen.getByRole("button", { name: action })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Duplicate Push" }));
    expect(await screen.findByRole("heading", { name: "Push (copy)" })).toBeInTheDocument();
    expect(await repo.templates.list()).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Edit Push" }));
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/templates\//));
  });

  it("asks before deleting and removes the template when confirmed", async () => {
    const user = userEvent.setup();
    await seedTemplate("Pull", "a0");
    render(<TemplatesView />);
    await user.click(await screen.findByRole("button", { name: "Delete Pull" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete template?" });
    expect(dialog).toHaveTextContent('"Pull" will be removed');
    await user.click(within(dialog).getByRole("button", { name: "Delete template" }));
    await waitFor(async () => expect(await repo.templates.list()).toHaveLength(0));
  });

  it("starts a workout from a template and goes to the workout screen", async () => {
    const user = userEvent.setup();
    const t = await seedTemplate("Legs", "a0");
    render(<TemplatesView />);
    await user.click(await screen.findByRole("button", { name: "Start Legs" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/workout"));
    expect((await repo.workouts.active())?.templateId).toBe(t.id);
  });
});

describe("TodayTemplatesCard", () => {
  it("invites you to create a template when there are none", async () => {
    render(<TodayTemplatesCard unit="KG" />);
    expect(await screen.findByText(/No templates yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create a template" })).toHaveAttribute("href", "/templates");
  });

  it("lists at most four, most recently started first, each with Start and Edit, plus an All templates link", async () => {
    const t = [await seedTemplate("A", "a0"), await seedTemplate("B", "a1"), await seedTemplate("C", "a2"), await seedTemplate("D", "a3"), await seedTemplate("E", "a4")];
    await repo.workouts.create({ startedAt: "2026-10-10T10:00:00.000Z", localDate: "2026-10-10", timezone: "UTC", endedAt: "2026-10-10T11:00:00.000Z", templateId: t[4]!.id });
    await repo.workouts.create({ startedAt: "2026-10-12T10:00:00.000Z", localDate: "2026-10-12", timezone: "UTC", endedAt: "2026-10-12T11:00:00.000Z", templateId: t[2]!.id });
    render(<TodayTemplatesCard unit="KG" />);
    const list = await screen.findByRole("list");
    const names = within(list).getAllByRole("listitem").map((li) => li.querySelector("strong")?.textContent);
    expect(names).toEqual(["C", "E", "A", "B"]);
    expect(within(list).getAllByRole("button", { name: /^Start / })).toHaveLength(4);
    expect(within(list).getAllByRole("link", { name: /^Edit / })).toHaveLength(4);
    expect(screen.getByRole("link", { name: /All templates \(5\)/ })).toHaveAttribute("href", "/templates");
  });

  it("starts a template from the card", async () => {
    const user = userEvent.setup();
    const created = await seedTemplate("Upper", "a0");
    render(<TodayTemplatesCard unit="KG" />);
    await user.click(await screen.findByRole("button", { name: "Start Upper" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/workout"));
    expect((await repo.workouts.active())?.templateId).toBe(created.id);
  });
});
