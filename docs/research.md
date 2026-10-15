# Research brief

Copied verbatim from `docs/PLAN.md` Appendix B in Phase 0. This is the evidence base for the analytics constants, the insight rules and the `/learn` articles. Items marked **[Contested]** or **[Verify]** must keep that label wherever they surface in the product. Stream G verifies every citation link before using it on `/learn`.

**Hypertrophy vs. hyperplasia**
- **Hypertrophy** means existing fibers get larger. The evidence for it is very strong: loading grows existing fibers (Jorgenson 2020, a scoping review of structural adaptations; it does not give a percentage range, so none is quoted here).
- **Hyperplasia** means new fibers form. In animals it only appears under extreme overload, and even there the findings are disputed (Antonio & Gonyea 1993).
  - Human studies that estimate fiber number before and after training exist (the Gowda abstract below pooled eleven): on average no change, and any change is hard to detect.
  - Elite bodybuilders have about the same number of fibers as untrained people (MacDougall 1984).
  - A 2025 meta-analysis abstract found no significant change (Gowda).
  - **[Contested]** D'Antona argues that hyperplasia may contribute at elite levels.
- **Sarcoplasmic vs. myofibrillar hypertrophy:** plausible (Roberts 2020; Haun 2019), but no one can program for one over the other.
- **What the app says:** "Muscles grow mainly because fibers get larger; whether adults gain new fibers is unresolved and likely minor. Training well for size covers it."

**Training variables**

| Variable | Hypertrophy | Strength |
|---|---|---|
| Weekly volume | 10–20 fractional sets per muscle (direct set 1.0, indirect 0.5), with diminishing returns (Schoenfeld 2017; Pelland 2025; Baz-Valle 2022) | Steeper diminishing returns after about 4–10 sets per lift per week |
| Per-session ceiling | About 11 fractional sets per muscle (Remmert 2025, preprint, **[Contested]**) | — |
| Load | Similar growth from about 30% to 85% of 1RM when sets are taken close to failure | Heavier is better (≥ 80% of 1RM) |
| Effort | 0–3 RIR; failure adds very little (Robinson 2024; Refalo 2023) | — |
| Frequency | Doesn't matter when volume is equal | Clearly helps, especially going from 1 to 2 sessions a week (Schoenfeld 2019; Pelland 2025) |
| Rest | 2–5 minutes for strength work (Singer 2024) | 2–5 minutes |

- **RIR estimates** are least reliable on sets above 15 reps and at RIR of 4 or more.
- **Progressing load:**
  - Double progression with the 2-for-2 rule (NSCA): add load when the last set beats the target by 2 reps in two sessions in a row.
  - Increments are 2–10%: about 1–2.5 kg for upper body and 2.5–5 kg for lower body.
  - Machine stack jumps can exceed 10%; in that case add reps first.

**e1RM formulas**

| Formula | Equation |
|---|---|
| Epley | `w(1 + r/30)` |
| Brzycki | `36w/(37 − r)` |
| Lombardi | `w·r^0.10` |
| Mayhew | `100w/(52.2 + 41.9e^(−0.055r))` |
| Wathan | `100w/(48.8 + 53.8e^(−0.075r))` |

- Formulas are most accurate at 10 reps or fewer, best at 3–6 (Reynolds 2006).
- They underestimate the deadlift by 9–14% (LeSuer 1997).
- 1RM test-retest varies by a median of 4.2% (Grgic 2020).
- A model fitted to the individual lifter beats pooled formulas (Mitter 2022).

**Relative strength scores**
- **DOTS:** `500·total / (a + bx + cx² + dx³ + ex⁴)`, where x is bodyweight in kg.
  - Men: a = −307.75076, b = 24.0900756, c = −0.1918759221, d = 0.0007391293, e = −0.000001093
  - Women: a = −57.96288, b = 13.6175032, c = −0.1126655495, d = 0.0005158568, e = −0.0000010706
  - Clamp bodyweight to 40–210 kg (men) or 40–150 kg (women).
- **IPF GL (classic):** `100·total / (A − B·e^(−C·BW))`
  - Men: A = 1199.72839, B = 1025.18162, C = 0.00921
  - Women: A = 610.32796, B = 1045.59282, C = 0.03048
  - Check value: 90 kg, 700 kg total → 93.06
  - Equipped men: 1236.25115 / 1449.21864 / 0.01644. Equipped women: 758.63878 / 949.31382 / 0.02435.
  - Bench-only and Wilks2 coefficients: **[Verify]** before enabling.
- **Allometric:** lift ÷ BW^0.67 (Jaric 2002).
- **Use only for:** barbell squat, bench press and deadlift.

**Progression curves**
- **Steele 2022** (n = 14,690): strength follows a linear-log curve. Gains were about 30–50% in year 1, and strength practically plateaued after 1–2 years. Sex, age and bodyweight barely changed the shape.
- **Latella 2020/2023** (powerlifters): about 0.15 kg/day (men) and 0.12 kg/day (women); about 7.5–12.5% gain in the first year of competing.
- **Swinton 2021:** across training studies the average strength gain is 14.3%, a useful population prior.
- **Muscle-gain rate heuristics** (coaches' estimates, not peer-reviewed, treat as upper bounds):
  - McDonald: about 20–25 lb in year 1, 10–12 in year 2, 5–6 in year 3, then 2–3 per year; halve for women.
  - Aragon: monthly gain of 1–1.5% of bodyweight (beginners), 0.5–1% (intermediate), 0.25–0.5% (advanced).
- **Forecast model:** Bayesian linear regression on ln(t + t₀) with population priors. Avoid an exponential curve toward a fixed ceiling, and avoid Banister fitness-fatigue models (they overfit sparse data).

**Sex, age and body composition**
- **Sex:**
  - Women are about 52% as strong as men in the upper body and 66% in the lower body, mostly because men's fibers are larger (Miller 1993).
  - In relative terms, hypertrophy is the same between sexes (effect size 0.07) and upper-body strength gains are larger in women (Roberts 2020).
  - So the app forecasts in **percent** without sex-specific curve shapes, and compares absolute numbers against sex-specific norms.
- **Age:** lifters aged 50 and over gained about 1.1 kg of lean mass over about 20 weeks (Peterson 2011).
- **FFMI:**
  - LBM = BW·(1 − BF%)
  - FFMI = LBM / h²
  - Normalized FFMI = FFMI + 6.1·(1.8 − h)
  - Drug-free ceiling: about 25 for men (Kouri 1995, **[Contested]**); 97.5th percentile about 23.9 for women (Harty 2019).
  - ±4 points of body fat shifts FFMI by about ±1.
- **US Navy tape method (cm, log base 10):**
  - Men: `495/(1.0324 − 0.19077·log(waist − neck) + 0.15456·log(h)) − 450`
  - Women: `495/(1.29579 − 0.35004·log(waist + hip − neck) + 0.22100·log(h)) − 450`
  - Standard error about 3.5%.
- **Deurenberg (BMI-based):** overestimates body fat in lifters, so it's never used for FFMI.
- **Strength-standard sources:**
  - StrengthLevel: data-driven, skews high.
  - OpenPowerlifting: competitors only.
  - ExRx/Kilgore: expert-derived.
  - Symmetric Strength: formula-based.
  - Always label which population a comparison uses.

**Machines vs. free weights**
- Hypertrophy is similar on both. Strength gains are specific to the mode trained (Haugen 2023).
- Load isn't comparable across machine brands (cams, lever arms, friction), across cable pulley ratios, or between plate-loaded sleds with and without the sled weight.
- **App rules:**
  - Machine series are keyed per `MachineProfile`.
  - Machine sets count fully toward weekly muscle volume.
  - Machine lifts get no DOTS score, no percentile, and no conversion to barbell equivalents.
  - A new gym or machine starts a new series.

**Citations** (stream G checks each link before using it on `/learn`)

*Hypertrophy and hyperplasia*
- Jorgenson 2020: https://pmc.ncbi.nlm.nih.gov/articles/PMC7408414/
- Antonio & Gonyea 1993: https://pubmed.ncbi.nlm.nih.gov/8107539/
- MacDougall 1984: https://experts.mcmaster.ca/scholarly-works/236035
- Gowda 2025 (abstract): https://rdw.rowan.edu/stratford_research_day/2025/may1/194
- D'Antona: https://www.physoc.org/magazine-articles/muscle-mass-at-the-top-a-likely-role-for-fibre-hyperplasia-in-humans/
- Roberts 2020, sarcoplasmic hypertrophy: https://pmc.ncbi.nlm.nih.gov/articles/PMC7372125/

*Volume, effort, frequency and rest*
- Schoenfeld 2017, volume: https://paulogentil.com/pdf/Dose-response%20relationship%20between%20weekly%20resistance%20training%20volume%20and%20increases%20in%20muscle%20mass%20-%20A%20systematic%20review%20and%20metaanalysis.pdf
- Schoenfeld 2017, load: https://pubmed.ncbi.nlm.nih.gov/28834797/
- Pelland 2025 (doi 10.1007/s40279-025-02344-w): https://sponet.de/sponet/Record/4097139?lng=en
- Baz-Valle 2022: https://pmc.ncbi.nlm.nih.gov/articles/PMC8884877/
- Remmert 2025 (preprint): https://sportrxiv.org/index.php/server/preprint/view/537
- Robinson 2024 (summary): https://biolayne.com/reps/issue-32/the-failure-factor-the-relationship-between-proximity-to-failure-and-strength-and-hypertrophy/
- Refalo 2023: https://openrepository.aut.ac.nz/items/78679612-6ff4-4d00-95d1-7920d072a760/full
- Singer 2024: https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/text
- Zourdos 2016: https://pubmed.ncbi.nlm.nih.gov/30747900/
- Bell 2023, deloading: https://pmc.ncbi.nlm.nih.gov/articles/PMC10511399/

*1RM estimation and relative strength*
- Grgic 2020: https://pmc.ncbi.nlm.nih.gov/articles/PMC7367986/
- Mitter 2022: https://research.birmingham.ac.uk/en/publications/modeling-the-relationship-between-load-and-repetitions-to-failure/
- e1RM formulas review: https://arxiv.org/pdf/2603.17495
- DOTS: https://coachway.io/tools/dots-calculator/
- IPF GL: https://coachway.io/tools/ipf-gl-points-calculator/
- Jaric 2002, allometric scaling: https://nsca.com/education/articles/kinetic-select/normalizing-fitness-data

*Progression over time*
- Steele 2022: https://www.strongerbyscience.com/?p=57447
- Latella 2020: https://pmc.ncbi.nlm.nih.gov/articles/PMC7448836/
- Latella 2023: https://www.sportrxiv.org/index.php/server/preprint/view/218
- Swinton 2021: https://sportrxiv.org/index.php/server/preprint/view/11

*Sex, age and body composition*
- Miller 1993: https://pubmed.ncbi.nlm.nih.gov/8477683/
- Roberts, Nuckols & Krieger 2020: https://pubmed.ncbi.nlm.nih.gov/32218059/
- Refalo 2025: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11869894/
- Peterson 2011: https://pubmed.ncbi.nlm.nih.gov/20543750/
- Kouri 1995 (via McDonald): https://bodyrecomposition.com/muscle-gain/another-look-at-the-ffmi/
- Harty 2019: https://digitalcommons.lindenwood.edu/faculty-research-papers/121
- Hodgdon & Beckett 1984, Navy tape method: https://apps.dtic.mil/sti/pdfs/ADA143890.pdf
- Deurenberg: https://pmc.ncbi.nlm.nih.gov/articles/PMC8980724/
- StrengthLevel methodology: https://strengthlevel.com/about

*Machines vs. free weights and guidelines*
- Haugen 2023: https://pmc.ncbi.nlm.nih.gov/articles/PMC10426227/
- ACSM 2026 Position Stand: https://www.newswise.com/articles/acsm-unveils-landmark-2026-resistance-training-guidelines-first-update-in-17-years

*Cited from memory, no link found yet:* Haun 2019, Helms 2014, Schoenfeld 2016 (rest intervals), Morton 2018. Stream G finds the sources before citing them.
