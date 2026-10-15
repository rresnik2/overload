// /learn: the evidence behind Overload's numbers, in plain language. Public (no sign-in).
import Link from "next/link";
import { ARTICLES } from "@/components/learn/articles";
import { HardCard } from "@/components/primitives/HardCard";
import { PageHeader } from "@/components/primitives/PageHeader";

export const metadata = { title: "Learn", description: "The evidence behind Overload's insights: hypertrophy, e1RM, RIR, volume and machines." };

export default function LearnIndexPage() {
  return (
    <div className="mkt-main">
      <PageHeader as="h1" title="Learn" meta={["Evidence", "Plain language"]} description="What the research says about the numbers in this app, what it does not say, and where we are guessing." />
      <ul className="learn-index">
        {ARTICLES.map((a) => (
          <li key={a.slug}>
            <Link href={`/learn/${a.slug}`} className="learn-index__link">
              <HardCard interactive className="learn-index__card">
                <h2>{a.title}</h2>
                <p>{a.summary}</p>
              </HardCard>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
