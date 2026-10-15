import { PageHeader } from "@/components/primitives/PageHeader";
import { ExerciseForm } from "@/components/workout/ExerciseForm";

export const metadata = { title: "New exercise" };

export default function NewExercisePage() {
  return (
    <>
      <PageHeader title="New exercise" meta={["Exercises", "Custom"]} description="Your own exercise, with the muscles it trains. It works offline and appears in the workout picker." />
      <ExerciseForm />
    </>
  );
}
