import { PageHeader } from "@/components/primitives/PageHeader";
import { ExerciseForm } from "@/components/workout/ExerciseForm";

export const metadata = { title: "Edit exercise" };

export default async function EditExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <PageHeader title="Edit exercise" meta={["Exercises", "Custom"]} />
      <ExerciseForm id={id} />
    </>
  );
}
