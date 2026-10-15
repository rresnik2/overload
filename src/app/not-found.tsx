import Link from "next/link";
import { EmptyState } from "@/components/primitives/EmptyState";
import { buttonClass } from "@/components/ui/Button";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl items-center p-6">
      <EmptyState
        title="That page isn't here"
        description="The link may be old, or the page was moved. Your workouts are safe."
        action={
          <Link className={buttonClass()} href="/today">
            Back to Today
          </Link>
        }
      />
    </main>
  );
}
