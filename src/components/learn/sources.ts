// Every external source the /learn articles link to. Each URL was fetched (or, for sites that block scripts, checked through
// the NCBI E-utilities / Crossref / DataCite / a real browser) in stream G, and every DOI resolves to that exact title. DOI links are used wherever a DOI exists; the two without a DOI (a practitioner summary and a news release) link to their pages. See
// change-requests/G-1-learn-source-findings.md for what differs from docs/research.md.
export type SourceKind = "paper" | "review" | "preprint" | "abstract" | "article" | "summary" | "news";

export interface Source {
  id: string;
  /** Short author-year label shown in the text. */
  label: string;
  /** Full title as it appears on the source. */
  title: string;
  url: string;
  kind: SourceKind;
}

const s = (id: string, label: string, title: string, url: string, kind: SourceKind): [string, Source] => [id, { id, label, title, url, kind }];

export const SOURCES: Record<string, Source> = Object.fromEntries([
  // hypertrophy and hyperplasia
  s("jorgenson2020", "Jorgenson 2020", "Identifying the Structural Adaptations that Drive the Mechanical Load-Induced Growth of Skeletal Muscle: A Scoping Review", "https://doi.org/10.3390/cells9071658", "review"),
  s("antonio1993", "Antonio & Gonyea 1993", "Skeletal muscle fiber hyperplasia", "https://doi.org/10.1249/00005768-199312000-00004", "review"),
  s("macdougall1984", "MacDougall 1984", "Muscle fiber number in biceps brachii in bodybuilders and control subjects", "https://doi.org/10.1152/jappl.1984.57.5.1399", "paper"),
  s("gowda2025", "Gowda 2025", "Systematic Review and Meta-Analysis Examining If Hyperplasia Occurs in Humans in Response to Resistance Training (conference abstract)", "https://doi.org/10.31986/issn.2689-0690_rdw.stratford_research_day.194_2025", "abstract"),
  s("dantona2006", "D'Antona 2006", "Muscle mass at the top: a likely role for fibre hyperplasia in humans (Physiology News)", "https://doi.org/10.36866/pn.63.26", "article"),
  s("roberts2020sarcoplasmic", "Roberts 2020", "Sarcoplasmic Hypertrophy in Skeletal Muscle: A Scientific \"Unicorn\" or Resistance Training Adaptation?", "https://doi.org/10.3389/fphys.2020.00816", "review"),
  s("haun2019", "Haun 2019", "Muscle fiber hypertrophy in response to 6 weeks of high-volume resistance training in trained young men is largely attributed to sarcoplasmic hypertrophy", "https://doi.org/10.1371/journal.pone.0215267", "paper"),
  // e1RM
  s("grgic2020", "Grgic 2020", "Test-Retest Reliability of the One-Repetition Maximum (1RM) Strength Assessment: a Systematic Review", "https://doi.org/10.1186/s40798-020-00260-z", "review"),
  s("mitter2022", "Mitter 2022", "Modelling the relationship between load and repetitions to failure in resistance training: A Bayesian analysis", "https://doi.org/10.1080/17461391.2022.2089915", "paper"),
  s("e1rmArxiv2026", "arXiv 2603.17495", "A Weight-Dependent 1RM Prediction Equation Optimized on 303,494 Near-Failure Sets Across 388 Exercises", "https://doi.org/10.48550/arXiv.2603.17495", "preprint"),
  // effort
  s("zourdos2021", "Zourdos 2021", "Proximity to Failure and Total Repetitions Performed in a Set Influences Accuracy of Intraset Repetitions in Reserve-Based Rating of Perceived Exertion", "https://doi.org/10.1519/JSC.0000000000002995", "paper"),
  s("refalo2023", "Refalo 2023", "Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy: A Systematic Review with Meta-analysis", "https://doi.org/10.1007/s40279-022-01784-y", "review"),
  s("robinson2024", "Robinson 2024 (summary)", "The Failure Factor: The Relationship Between Proximity to Failure and Strength and Hypertrophy (Biolayne research summary)", "https://biolayne.com/reps/issue-32/the-failure-factor-the-relationship-between-proximity-to-failure-and-strength-and-hypertrophy/", "summary"),
  s("schoenfeld2016rest", "Schoenfeld 2016", "Longer Interset Rest Periods Enhance Muscle Strength and Hypertrophy in Resistance-Trained Men", "https://doi.org/10.1519/JSC.0000000000001272", "paper"),
  // volume
  s("schoenfeld2017volume", "Schoenfeld 2017", "Dose-response relationship between weekly resistance training volume and increases in muscle mass: A systematic review and meta-analysis", "https://doi.org/10.1080/02640414.2016.1210197", "review"),
  s("bazvalle2022", "Baz-Valle 2022", "A Systematic Review of The Effects of Different Resistance Training Volumes on Muscle Hypertrophy", "https://doi.org/10.2478/hukin-2022-0017", "review"),
  s("pelland2025", "Pelland 2025", "The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains", "https://doi.org/10.1007/s40279-025-02344-w", "review"),
  s("remmert2025", "Remmert 2025 (preprint)", "Is There Too Much of a Good Thing? Meta-Regressions of the Effect of Per-Session Volume on Hypertrophy and Strength", "https://doi.org/10.51224/SRXIV.537", "preprint"),
  // machines
  s("haugen2023", "Haugen 2023", "Effect of free-weight vs. machine-based strength training on maximal strength, hypertrophy and jump performance: a systematic review and meta-analysis", "https://doi.org/10.1186/s13102-023-00713-4", "review"),
  s("acsm2026", "ACSM 2026 (news release)", "ACSM Unveils Landmark 2026 Resistance Training Guidelines, First Update in 17 Years", "https://www.newswise.com/articles/acsm-unveils-landmark-2026-resistance-training-guidelines-first-update-in-17-years", "news"),
]);

export function source(id: string): Source {
  const found = SOURCES[id];
  if (!found) throw new Error(`Unknown /learn source: ${id}`);
  return found;
}
