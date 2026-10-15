// The /learn index. One entry per article; slugs match the folders under src/app/(marketing)/learn/.
export interface ArticleMeta {
  slug: string;
  title: string;
  summary: string;
}

export const ARTICLES: readonly ArticleMeta[] = [
  { slug: "hypertrophy-vs-hyperplasia", title: "Hypertrophy vs. hyperplasia", summary: "Muscles grow mainly because fibers get larger. Whether adults gain new fibers is unresolved." },
  { slug: "e1rm", title: "Estimated one-rep max (e1RM)", summary: "How Overload estimates your max from a working set, and why a 5% change is noise." },
  { slug: "rir", title: "Reps in reserve (RIR)", summary: "How close to failure to train, and how well you can judge it." },
  { slug: "volume-landmarks", title: "Weekly volume and volume landmarks", summary: "How many hard sets per muscle per week, with diminishing returns." },
  { slug: "machine-vs-free-weight", title: "Machines vs. free weights", summary: "Similar muscle growth, but the numbers on the stack are not comparable across machines." },
] as const;

export function articleBySlug(slug: string): ArticleMeta | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
