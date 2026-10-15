import Link from "next/link";
import type { ReactNode } from "react";
import { HardCard } from "@/components/primitives/HardCard";
import { PageHeader } from "@/components/primitives/PageHeader";
import { source, type SourceKind } from "./sources";

/** Shared frame of a /learn article: header, readable column, sources, disclaimer. */
export function Article({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
  return (
    <div className="mkt-main">
      <p className="learn__back">
        <Link href="/learn" className="link-underline">
          All articles
        </Link>
      </p>
      <HardCard as="article" className="learn">
        <PageHeader as="h1" title={title} meta={["Evidence", "Learn"]} description={lede} />
        <div className="learn__body">{children}</div>
      </HardCard>
    </div>
  );
}

export function LearnSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="learn__section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** An inline source link, e.g. (Haun 2019). Opens the source in a new tab. */
export function Cite({ id }: { id: string }) {
  const s = source(id);
  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" className="learn__cite" data-source={s.id} title={s.title}>
      {s.label}
    </a>
  );
}

/** The label the research brief requires wherever a contested claim surfaces. */
export function Contested() {
  return <span className="learn__contested">[Contested]</span>;
}

/** The plain-language takeaway for the app, set apart from the evidence. */
export function InApp({ children }: { children: ReactNode }) {
  return (
    <aside className="learn__inapp" aria-label="In Overload">
      <p className="learn__inapp-label">In Overload</p>
      {children}
    </aside>
  );
}

const KIND_LABEL: Record<SourceKind, string> = {
  paper: "Study",
  review: "Review / meta-analysis",
  preprint: "Preprint (not peer reviewed)",
  abstract: "Conference abstract",
  article: "Magazine article",
  summary: "Practitioner summary",
  news: "News release",
};

export function SourceList({ ids }: { ids: readonly string[] }) {
  return (
    <section className="learn__section learn__sources" aria-labelledby="sources-heading">
      <h2 id="sources-heading">Sources</h2>
      <ul>
        {ids.map((id) => {
          const s = source(id);
          return (
            <li key={id}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="link-underline" data-source={s.id}>
                {s.title}
              </a>
              <span className="learn__source-kind"> {s.label}, {KIND_LABEL[s.kind]}</span>
            </li>
          );
        })}
      </ul>
      <p className="learn__disclaimer">
        General education, not medical advice. Links go to the publisher, PubMed or a repository; preprints and summaries are labelled as such.
      </p>
    </section>
  );
}
