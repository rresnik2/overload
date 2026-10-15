# G-1: source findings from verifying the /learn citations

Not blocking. These are corrections to frozen/other-stream files that stream G found while visiting every link in `docs/research.md`. Stream G worked around all of them (its own `src/components/learn/sources.ts` holds the verified links).

## What

1. **`src/lib/analytics/constants.ts` (stream D), `CITATIONS` entries**
   - `zourdos2016`: label says "Zourdos 2016: RIR-based RPE scale", but the URL (`pubmed.ncbi.nlm.nih.gov/30747900/`) is **Zourdos et al., J Strength Cond Res 2021, "Proximity to Failure and Total Repetitions Performed in a Set Influences Accuracy of Intraset Repetitions in Reserve-Based Rating of Perceived Exertion"**. Suggested: key `zourdos2021`, label "Zourdos 2021: accuracy of RIR predictions".
   - `deurenberg`: the URL (`PMC8980724`) is **Seidell & Visscher et al., Br J Nutr 2022, "Looking back: BMI as a measure of body fatness: age- and sex-specific prediction formulas. Thirty years later"**, not Deurenberg 1991. Relabel or find the original.
   - `latella2023`: `https://www.sportrxiv.org/...` (with `www.`) has a TLS certificate mismatch and fails for scripts; `https://sportrxiv.org/index.php/server/preprint/view/218` works. That preprint has since been published (doi 10.1007/s40279-023-01962-6).
   - `schoenfeld2017volume`: the URL is a copy of the PDF on a third-party host (`paulogentil.com`). Suggested replacement: `https://pubmed.ncbi.nlm.nih.gov/27433992/`.
   - `pelland2025`: the URL is a library catalogue record (`sponet.de`). Suggested replacement: `https://pubmed.ncbi.nlm.nih.gov/41343037/` (Sports Med 2026;56(2):481-505, online Dec 2025).
   - `singer2024`: `/text` redirects to an odd `public-pages-files-2025.frontiersin.org` host; suggested `https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full`.
   - Entries with a link now available for the sources the brief marked "cited from memory" (found via PubMed): Haun 2019 `https://pubmed.ncbi.nlm.nih.gov/31166954/`; Schoenfeld 2016 rest intervals `https://pubmed.ncbi.nlm.nih.gov/26605807/`; Morton 2018 protein `https://pubmed.ncbi.nlm.nih.gov/28698222/`; Helms 2014 nutrition `https://pubmed.ncbi.nlm.nih.gov/24864135/`. (Reynolds 2006, LeSuer 1997, Schoenfeld 2019 frequency and the NSCA 2-for-2 source are still unfound.)

2. **`docs/research.md` (frozen)**
   - "In humans there are no studies that count fibers before and after training" is not accurate: the Gowda 2025 abstract (already cited there) pooled **eleven** studies that estimated fiber number before and after resistance training. The /learn article says what it found (no change on average; hard to detect).
   - "fiber cross-sectional area rises about 10-35% over 8-16 weeks (Jorgenson 2020)": the Jorgenson 2020 abstract (a scoping review of structural adaptations) does not state that range, so /learn does not repeat it.
   - Links that could not be verified from a script (bot protection): `apps.dtic.mil` (Hodgdon & Beckett 1984 PDF returned an "Under Maintenance" page), `nsca.com` (Jaric 2002 normalizing-fitness-data, Cloudflare 403). /learn does not use them.

## Why

Wrong labels on a citation shown to users (insight cards link `CITATIONS` entries) and two research-brief statements that the cited source contradicts. No stream G functionality depends on the fix.

## Workaround

`src/components/learn/sources.ts` is the verified list used by /learn. Insight cards render D's `CITATIONS` as they are.

## Update: DOI links

Following the coordinator's guidance, `src/components/learn/sources.ts` now links every source that has a DOI through `https://doi.org/<DOI>`; each DOI was resolved with content negotiation (Crossref / DataCite) and returns exactly the title shown. Two sources have no DOI and keep page links: the Biolayne summary of Robinson et al. (a practitioner summary) and the ACSM 2026 news release. Antonio & Gonyea 1993 is 10.1249/00005768-199312000-00004 and Mitter 2022 is 10.1080/17461391.2022.2089915 (the Birmingham repository link in `research.md` is the same paper). Unverifiable from a script and not used in /learn: Hodgdon & Beckett 1984 (dtic.mil maintenance page), Jaric 2002 (nsca.com 403; its primary paper was not looked up).

## Update: the three PDFs the owner supplied (read from `~/dev/gesture_td/docs/`)

They resolve the sources that scripts could not fetch. None is used in a `/learn` article (no article covers relative strength or progression curves), so nothing in the app changed; this is for whoever edits `CITATIONS` and `docs/research.md`.

- **`Normalizing Fitness Data.pdf`** is the NSCA page (Kinetic Select, May 2017), an excerpt from *NSCA's Guide to Tests and Assessments* (Human Kinetics). It does state allometric scaling as `(kg lifted) / (kg body weight)^0.67`, but it attributes that exponent to **Jaric, Mirkov and Markovic 2005**, not "Jaric 2002" as `research.md` and `CITATIONS.jaric2002` say. Relabel it as the NSCA excerpt citing Jaric et al. 2005 (Human Kinetics book excerpt, not a primary study), or cite the primary paper by DOI.
- **`Longitudinal+growth+modelling+...pdf`** is Latella et al. 2022, the SportRxiv preprint behind `CITATIONS.latella2023` (`sportrxiv.org/.../view/218`). Its abstract confirms "about 7.5-12.5% in the first year" and faster progression in females. It was published as Latella et al., Sports Med, 7 Dec 2023, `https://doi.org/10.1007/s40279-023-01962-6` ("Using Powerlifting Athletes to Determine Strength Adaptations Across Ages in Males and Females: A Longitudinal Growth Modelling Approach", resolves via Crossref). Suggest citing the DOI and labelling it "Latella 2023 (published version of the 2022 preprint)". I read only the abstract and introduction: the 0.15 and 0.12 kg/day figures in `research.md` were not checked.
- **`SportRxiv+Submission_LATELLA.pdf`** is a different paper: **van den Hoek et al. 2023**, "Is powerlifting a viable method for engaging adults of all ages in resistance training? A retrospective, longitudinal population analysis with comparison to population norms" (Latella is last author; preprint, not peer reviewed). It compares Australian powerlifters with population norms (21,514 competitors, 1968-2022). It is not the Latella 2023 progression paper; if the owner meant it as a source for percentile or norms work, note that it is a powerlifter-versus-population comparison, not a norms table.

These PDFs live in the `gesture_td` project's `docs/`, not in this repository's `docs/` (which is frozen and unchanged).
