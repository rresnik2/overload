// Every external source the /learn articles link to. Each URL was fetched (or, for sites that block scripts, checked through
// the NCBI E-utilities / a real browser) in stream G, and the page was confirmed to be the paper named here. See
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
  s("jorgenson2020", "Jorgenson 2020", "Identifying the Structural Adaptations that Drive the Mechanical Load-Induced Growth of Skeletal Muscle: A Scoping Review", "https://pmc.ncbi.nlm.nih.gov/articles/PMC7408414/", "review"),
  s("antonio1993", "Antonio & Gonyea 1993", "Skeletal muscle fiber hyperplasia", "https://pubmed.ncbi.nlm.nih.gov/8107539/", "review"),
  s("macdougall1984", "MacDougall 1984", "Muscle fiber number in biceps brachii in bodybuilders and control subjects", "https://experts.mcmaster.ca/scholarly-works/236035", "paper"),
  s("gowda2025", "Gowda 2025", "Systematic Review and Meta-Analysis Examining If Hyperplasia Occurs in Humans Performing Resistance Training (conference abstract)", "https://rdw.rowan.edu/stratford_research_day/2025/may1/194", "abstract"),
  s("dantona2006", "D'Antona 2006", "Muscle mass at the top: a likely role for fibre hyperplasia in humans (Physiology News)", "https://www.physoc.org/magazine-articles/muscle-mass-at-the-top-a-likely-role-for-fibre-hyperplasia-in-humans/", "article"),
  s("roberts2020sarcoplasmic", "Roberts 2020", "Sarcoplasmic Hypertrophy in Skeletal Muscle: A Scientific \"Unicorn\" or Resistance Training Adaptation?", "https://pmc.ncbi.nlm.nih.gov/articles/PMC7372125/", "review"),
  s("haun2019", "Haun 2019", "Muscle fiber hypertrophy in response to 6 weeks of high-volume resistance training in trained young men is largely attributed to sarcoplasmic hypertrophy", "https://pubmed.ncbi.nlm.nih.gov/31166954/", "paper"),
  // e1RM
  s("grgic2020", "Grgic 2020", "Test-Retest Reliability of the One-Repetition Maximum (1RM) Strength Assessment: a Systematic Review", "https://pmc.ncbi.nlm.nih.gov/articles/PMC7367986/", "review"),
  s("mitter2022", "Mitter 2022", "Modeling the relationship between load and repetitions to failure in resistance training: A Bayesian analysis", "https://research.birmingham.ac.uk/en/publications/modeling-the-relationship-between-load-and-repetitions-to-failure/", "paper"),
  s("e1rmArxiv2026", "arXiv 2603.17495", "A Weight-Dependent 1RM Prediction Equation Optimized on 303,494 Near-Failure Sets Across 388 Exercises", "https://arxiv.org/abs/2603.17495", "preprint"),
  // effort
  s("zourdos2021", "Zourdos 2021", "Proximity to Failure and Total Repetitions Performed in a Set Influences Accuracy of Intraset Repetitions in Reserve-Based Rating of Perceived Exertion", "https://pubmed.ncbi.nlm.nih.gov/30747900/", "paper"),
  s("refalo2023", "Refalo 2023", "Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy: A Systematic Review with Meta-analysis", "https://openrepository.aut.ac.nz/items/78679612-6ff4-4d00-95d1-7920d072a760/full", "review"),
  s("robinson2024", "Robinson 2024 (summary)", "The Failure Factor: The Relationship Between Proximity to Failure and Strength and Hypertrophy (Biolayne research summary)", "https://biolayne.com/reps/issue-32/the-failure-factor-the-relationship-between-proximity-to-failure-and-strength-and-hypertrophy/", "summary"),
  s("schoenfeld2016rest", "Schoenfeld 2016", "Longer Interset Rest Periods Enhance Muscle Strength and Hypertrophy in Resistance-Trained Men", "https://pubmed.ncbi.nlm.nih.gov/26605807/", "paper"),
  // volume
  s("schoenfeld2017volume", "Schoenfeld 2017", "Dose-response relationship between weekly resistance training volume and increases in muscle mass: A systematic review and meta-analysis", "https://pubmed.ncbi.nlm.nih.gov/27433992/", "review"),
  s("bazvalle2022", "Baz-Valle 2022", "A Systematic Review of The Effects of Different Resistance Training Volumes on Muscle Hypertrophy", "https://pmc.ncbi.nlm.nih.gov/articles/PMC8884877/", "review"),
  s("pelland2025", "Pelland 2025", "The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains", "https://pubmed.ncbi.nlm.nih.gov/41343037/", "review"),
  s("remmert2025", "Remmert 2025 (preprint)", "Is There Too Much of a Good Thing? Meta-Regressions of the Effect of Per-Session Volume on Hypertrophy and Strength", "https://sportrxiv.org/index.php/server/preprint/view/537", "preprint"),
  // machines
  s("haugen2023", "Haugen 2023", "Effect of free-weight vs. machine-based strength training on maximal strength, hypertrophy and jump performance: a systematic review and meta-analysis", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10426227/", "review"),
  s("acsm2026", "ACSM 2026 (news release)", "ACSM Unveils Landmark 2026 Resistance Training Guidelines, First Update in 17 Years", "https://www.newswise.com/articles/acsm-unveils-landmark-2026-resistance-training-guidelines-first-update-in-17-years", "news"),
]);

export function source(id: string): Source {
  const found = SOURCES[id];
  if (!found) throw new Error(`Unknown /learn source: ${id}`);
  return found;
}
