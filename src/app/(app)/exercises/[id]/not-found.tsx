import Link from "next/link";
import { EmptyState } from "@/components/primitives/EmptyState";

export default function ExerciseNotFound() {
  return (
    <EmptyState
      title="Exercise not found"
      description="It may have been removed, or it belongs to another account."
      action={
        <Link href="/exercises" className="btn btn-neutral">
          Back to the library
        </Link>
      }
    />
  );
}
