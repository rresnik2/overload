"use client";
import Link from "next/link";
import { EmptyState } from "@/components/primitives/EmptyState";
import { Button, buttonClass } from "@/components/ui/Button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl items-center p-6">
      <EmptyState
        title="Something went wrong"
        description={
          <>
            This page failed to load. Anything you logged is saved on your phone and will sync.
            {error.digest ? <span className="num block text-sm opacity-70">Reference {error.digest}</span> : null}
          </>
        }
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={reset}>Try again</Button>
            <Link className={buttonClass({ variant: "ghost" })} href="/today">
              Back to Today
            </Link>
          </div>
        }
      />
    </main>
  );
}
