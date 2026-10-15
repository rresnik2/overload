import { PageHeader } from "@/components/primitives/PageHeader";
import { TemplateEditor } from "@/components/templates/TemplateEditor";
import { PrefsProvider } from "@/components/workout/prefs";
import { loadWorkoutPrefs } from "@/components/workout/prefs.server";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "Edit template" };

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prefs = await loadWorkoutPrefs(await requireUser());
  return (
    <PrefsProvider prefs={prefs}>
      <PageHeader title="Edit template" meta={["Templates"]} />
      <TemplateEditor key={id} id={id} />
    </PrefsProvider>
  );
}
