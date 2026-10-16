import { PageHeader } from "@/components/primitives/PageHeader";
import { PageIntro } from "@/components/ui/PageIntro";
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
      <PageIntro id="template-editor">
        Set how many warm-up and working sets you want for each exercise, and the rep range to aim for. Everything saves as you type.
      </PageIntro>
      <TemplateEditor key={id} id={id} />
    </PrefsProvider>
  );
}
