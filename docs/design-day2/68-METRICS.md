> **Amended 2026-09-11 (WP82, `74-GATES-AND-REPORT-V3.md`).** The campaign side of §6.4.4 is built: a `parity` gate names a fairness metric and a `drift` gate a reference window, both over this package. `driftIn` keeps the signature WP76 left it with — the `psi:<feature>` series, the `agreement` series and the new flag kinds want a series of reports, which the Monitor (WP84) is the first host to have.

# 68 — Metrics: fairness, drift, human load, intervals, and the validation suite (WP76)

> **Status:** design of record for WP76 (`65-DAY5-ROADMAP.md` Phase R), opened 2026-09-10 on the `day5` branch. Stage A is this note — every metric, its definition, its interval method, its statistical test, the planted-effect design and the null design, with the hand cases worked so a reviewer can check the arithmetic before the code exists. Stages B and C are the package `@craftabot/metrics` and its validation suite, with `docs/metrics.md` generated from the suite's results.
>
> **What this is.** `64-TARGET-DESIGN-V5.md` §6.4.1–§6.4.3 and §6.4.1a in full; tenet 20 (*a metric is defined once, validated once, and read everywhere*), tenet 19 (*a number carries its provenance or it is not shown*), tenet 26 (the human-load figures the thought experiment assumes). Retires G47 and G48; the gates and the report v3 that consume these are WP82's (`64-…` §6.4.4).

---

## 1. Where the code is

1. **Parity is a bound with no interval** — `evals/src/campaign.ts` `parityValues` groups cells by a cohort attribute and takes one number per group (an outcome rate, an evaluator pass rate, a label rate, a derived metric, a metric mean); the gate compares max − min to `maxDifference` or min / max to `minRatio`. No *n*, no interval, no test (`50-…` §7's decision, kept for the gate — `64-…` §12).
2. **The confusion fold is right and stays** — `campaign-summary.ts` `confusionOf`/`derivedOf` (precision, recall, F1, false-positive rate) over a labelled evaluator's cells. The Fraud Desk's campaign test folds one by hand and checks it. The package's precision and recall must equal these (the DoD).
3. **Drift is two comparisons** — `governance/src/reports/drift.ts` `mixDistance` (total-variation distance over trip shares, with the empty-vs-nonempty rule: 1) and a plain difference on the loop rate and each domain series, against a pooled window with `DRIFT_DEFAULTS`. `driftIn`'s test holds a snapshot; the package takes the arithmetic and the snapshot must not move.
4. **Nothing folds people** — `desk/src/metrics.ts` counts `approval.requested` per case; nothing counts touches, minutes or FTEs, and nothing knows a decision's autonomy ceiling (G58).
5. **`seededRandom` lives in `@craftabot/desk`**; the package may depend on `core` types only, so its validation generators carry their own small PRNG.
6. **Stage records do not exist yet** (WP79). The human-load metrics are defined over a structural input — a case with its touches and its decisions' levels — that WP79's `StageRecord` folds into, so the metrics land now with a fixture and WP79 supplies the fold.

## 2. Principles

- **Pure, plain arrays in, a value and its provenance out.** Every function takes arrays of plain records and returns `{ value, n, interval, confidence, method, underpowered, … }`. No metric reads a report, a trace or a world.
- **The bound decides; the interval informs; the test is reported.** A `p` is on every result that has a test, and no gate reads it (`64-…` §6.4.1).
- **Underpowered is a fact on the number, not a failure.** `underpowered` is true when any group's *n* is under the floor (default 30). A gate asked for `power: 'required'` turns that into *inconclusive* (WP82); the number is still shown, greyed.
- **Conventions are named as conventions.** The four-fifths rule, PSI's 0.10 / 0.25, the 5% null bound — stated on the result's `method` or in `docs/metrics.md`, never implied.
- **One definition, three tests.** A metric is not in the package until its hand case, its planted effect and its null are green; `docs/metrics.md` is generated from those results, so the page and the code cannot disagree.

## 3. The definitions

### 3.1 The inputs

```ts
export interface DecidedCase {
	group: string;                 // the cohort value this case is sliced by
	decision: 'approve' | 'decline' | 'refer';
	verdict?: 'approve' | 'decline' | 'refer';   // the rule's — tenet 23's judge of the decision
	repaid?: boolean;              // the performance label: !defaultedWithin12m — the judge of the policy
	stratum?: string;              // a legitimate factor's value, for conditional parity
	pairId?: string;               // matched pairs share one
}
export interface FlipCase { original: DecidedCase['decision']; flipped: DecidedCase['decision'] }
```

*Approved* means `decision === 'approve'`; a referral is not an approval. *Positive* for the outcome-conditioned metrics is `repaid === true` (the customer would have repaid), which exists for declines too (`64-…` §6.1.4 draws the label for every application).

### 3.2 Fairness (`64-…` §6.4.1)

| Metric | Value | Per-group statistic | Interval on the value | Test |
|---|---|---|---|---|
| `demographic-parity` | max − min over groups of P(approve \| group) | approval rate | Newcombe hybrid score between the highest and lowest groups | two-proportion z (Fisher exact when a group is under the floor) |
| `disparate-impact` | min / max of P(approve \| group); the four-fifths convention is ≥ 0.8 | approval rate | log-ratio (Haldane +0.5 on a zero cell) | the same |
| `equal-opportunity` | max − min of P(approve \| repaid, group) | approval rate among the repaid | Newcombe | the same |
| `equalised-odds` | the larger of the equal-opportunity difference and the false-positive-rate difference, FPR = P(approve \| defaulted, group) | both rates | the larger component's Newcombe, each component at 1 − α/2 (Bonferroni) so the pair keeps the stated confidence | the larger component's |
| `predictive-parity` | max − min of P(repaid \| approved, group) | repayment rate among the approved | Newcombe | the same |
| `conditional-parity` | Σ over strata of w_s × (max − min of P(approve \| group, stratum)), w_s the stratum's share of cases; strata with fewer than two groups present are left out and named | approval rate per stratum | the weighted sum of the strata's Newcombe bounds (conservative: bounds add, they do not pool) | none — reported without `p` |
| `rule-agreement` | max − min of P(decision = verdict \| group) | agreement rate | Newcombe | two-proportion z / Fisher |
| `discordance` | over pairs sharing a `pairId` with exactly two cases in two groups: the share decided differently | — | Clopper–Pearson on discordant / pairs | the sign test on the direction: pairs where the first group was approved and the second not, against the reverse |
| `counterfactual-flip` | over `FlipCase`s: the share whose decision changed | — | Clopper–Pearson | none |

Every result: `{ metric, value, groups, n: Record<group, number>, rates: Record<group, number>, extremes: { high, low }, interval: [lo, hi], confidence, method, underpowered, p?, test? }`. `underpowered` is true when the smallest group counted is under `floor` (default 30); the value is computed regardless.

**Hand cases** (stage C's fixtures, each twenty rows; the arithmetic the test repeats):

- *Demographic parity.* Group A: 10 cases, 7 approved (0.70); group B: 10 cases, 4 approved (0.40). Value 0.30. Wilson at 95% for 7/10 (z² = 3.8416): centre (0.7 + 3.8416/20) / (1 + 3.8416/10) = 0.8921/1.3842 = 0.6445; half-width 1.96 × √(0.021 + 0.0096) / 1.3842 = 1.96 × 0.1749 / 1.3842 = 0.2477 → [0.3968, 0.8922]. For 4/10: centre 0.5921/1.3842 = 0.4278, half-width 1.96 × 0.1833 / 1.3842 = 0.2596 → [0.1682, 0.6873]. Newcombe: lower = 0.30 − √((0.70 − 0.3968)² + (0.6873 − 0.40)²) = 0.30 − √(0.0919 + 0.0825) = 0.30 − 0.4177 = −0.118; upper = 0.30 + √((0.8922 − 0.70)² + (0.40 − 0.1682)²) = 0.30 + √(0.0369 + 0.0537) = 0.30 + 0.3011 = 0.601. Two-proportion z: pooled 0.55, se = √(0.55 × 0.45 × 0.2) = 0.2225, z = 1.348, p = 0.178 (under the floor the result carries Fisher's p instead). `underpowered: true` (n = 10 < 30).
- *Disparate impact.* The same rows: 0.40 / 0.70 = 0.571. Log-ratio: ln(0.571) = −0.560; se = √(1/4 − 1/10 + 1/7 − 1/10) = √(0.15 + 0.0429) = 0.4392; ±1.96 × 0.4392 = ±0.861 → e^(−1.421), e^(0.301) = [0.242, 1.351].
- *Equal opportunity.* Of the twenty, twelve repaid — A: 6 repaid, 5 of them approved (0.833); B: 6 repaid, 3 approved (0.500). Value 0.333. _Predictive parity_ on the same rows: P(repaid | approved) is 5/7 for A and 3/4 for B, max − min = 0.036.
- *Discordance.* Ten pairs, three discordant → 0.30; Clopper–Pearson 95% [0.0667, 0.6525]; two of the three favour A → sign test p = 1.0 (2 × P(X ≤ 1 of 3) = 2 × 0.5, capped).

### 3.3 Drift (`64-…` §6.4.2)

| Metric | Value | Notes |
|---|---|---|
| `psi` | Σ_bins (c_i − r_i) ln(c_i / r_i), c and r the current and reference shares; bins are the reference's deciles for a number, its categories for a string; shares floored at 1e-4 before the log | reading: < 0.10 stable, 0.10–0.25 watch, > 0.25 act — a convention, on the result |
| `ks` | D = max \|F_ref − F_cur\|, p from the asymptotic Kolmogorov distribution with the Stephens correction on the effective n | continuous features only |
| `outcome-mix` | ½ Σ \|p − q\| over the union of categories; 0 when both empty, 1 when one is empty — `governance`'s `mixDistance`, moved | decisions, labels, trips |
| `agreement` | P(decision = verdict) in the current set minus in the reference set, Newcombe on the difference | |
| `fairness` | any §3.2 metric on the current set minus on the reference set; the interval is the two intervals' half-widths combined in quadrature | |
| `page-hinkley` | over a series x_t: m_t = Σ (x_i − x̄_i − δ), PH_t = m_t − min m_t; detected at the first t with PH_t > λ | δ the tolerated drift, λ the alarm threshold, both stated |

**Hand cases.** *PSI*: reference shares [0.5, 0.3, 0.2], current [0.4, 0.3, 0.3] → (−0.1) ln(0.8) + 0 + 0.1 ln(1.5) = 0.0223 + 0.0405 = 0.0629. *Outcome mix*: {a: 6, b: 4} vs {a: 2, b: 8} → ½ (|0.6 − 0.2| + |0.4 − 0.8|) = 0.40. _Agreement drift_: a reference set agreeing 4 of 20 against a current set agreeing 16 of 20 → +0.60. _Page–Hinkley_: the series [0, 0, 0, 1, 1, 1, 1] with δ = 0.1, λ = 0.5: at t = 3 the running mean is 0.25 and PH₃ = 0.65 > λ, so it raises at index 3.

### 3.4 Human load and decision rights (`64-…` §6.4.1a)

```ts
export interface TouchedCase {
	id: string;
	touches: Array<{ kind: string }>;          // 'four-eyes' | 'returned' | 'vulnerability' | 'sar-consent' | 'human-stage' | …
	decisions?: Array<{ kind: string; level: 1 | 2 | 3 | 4 | 5 }>;   // what was decided and at what autonomy level
}
```

| Metric | Value | Interval |
|---|---|---|
| `touches-per-case` | mean touches over cases, by kind too | mean ± t × sd / √n (Welch–Satterthwaite is the two-sample form; one sample uses the t with n − 1) |
| `unattended-rate` | share of cases with zero touches | Wilson |
| `minutes-per-case` | Σ over touches of the table's minutes for the kind, averaged over cases — the table is a calibration-style row the host passes (`fs-bank`'s `minutes-per-touch`, an assumption that says so) | as touches-per-case, scaled |
| `human-load-at-volume` | minutes-per-case × arrivals per day ÷ productive minutes per FTE-day (default 390, stated) = FTE-days per day | the minutes-per-case interval, scaled |
| `ceiling-breach-rate` | share of decisions whose level exceeds the ceiling for their kind (the thought experiment's decision-rights table, handed in) | Wilson |
| `oversight-cost` | treatment touches-per-case − baseline touches-per-case | Welch |

**Hand case.** Six cases with touch counts [0, 1, 1, 2, 0, 3]: mean 1.167, sd 1.169, t(5, 0.975) = 2.571 → ± 1.227 → [−0.06, 2.39]; unattended 2/6 = 0.333, Wilson [0.0968, 0.7000]. Decisions: four at level 4 of kind `approve` (ceiling 4), two at level 4 of kind `decline` (ceiling 3) → breach rate 2/6.

### 3.5 Intervals and tests (`64-…` §6.4.1)

- **Wilson** score interval for a proportion k/n at confidence c (z the standard-normal quantile): centre (p̂ + z²/2n)/(1 + z²/n), half-width z √(p̂(1 − p̂)/n + z²/4n²)/(1 + z²/n); n = 0 → [0, 1].
- **Newcombe** hybrid score (his method 10) for p̂₁ − p̂₂ with Wilson bounds (l₁, u₁), (l₂, u₂): [d − √((p̂₁ − l₁)² + (u₂ − p̂₂)²), d + √((u₁ − p̂₁)² + (p̂₂ − l₂)²)].
- **Log-ratio** for p̂₁ / p̂₂: exp(ln(p̂₁/p̂₂) ± z √(1/a − 1/n₁ + 1/b − 1/n₂)), a and b the successes; a zero cell adds 0.5 to all four (Haldane–Anscombe) and says so.
- **Clopper–Pearson** exact for k/n: the beta quantiles B(α/2; k, n − k + 1) and B(1 − α/2; k + 1, n − k), by bisection on the regularised incomplete beta.
- **The t interval** for a mean: x̄ ± t_{n−1, 1−α/2} s/√n; the **Welch** interval for a difference of means with the Welch–Satterthwaite degrees of freedom.
- **Two-proportion z**: pooled p̄, z = (p̂₁ − p̂₂)/√(p̄(1 − p̄)(1/n₁ + 1/n₂)), two-sided p = 2(1 − Φ(|z|)).
- **Fisher's exact** on the 2 × 2, two-sided by summing the hypergeometric probabilities no larger than the observed table's.
- **The sign test**: with m discordant pairs and k favouring the first group, two-sided p = 2 min(P(X ≤ k), P(X ≥ k)) under Binomial(m, ½), capped at 1.
- **Kolmogorov–Smirnov** two-sample: p = Q_KS((√n_e + 0.12 + 0.11/√n_e) D), n_e = n₁n₂/(n₁ + n₂), Q_KS(λ) = 2 Σ (−1)^(j−1) e^(−2j²λ²).
- The normal CDF by the complementary-error-function approximation with fractional error under 1.2 × 10⁻⁷; the normal quantile by Acklam's rational approximation refined by one Newton step; the t quantile by bisection on the t CDF expressed through the regularised incomplete beta.

## 4. The validation suite (`64-…` §6.4.3; stage C)

For every metric, three tests in `packages/metrics/src/validation/`, and one `suite.ts` that runs the same three and returns their results as data, so `docs/metrics.md` is generated from what the tests saw.

- **Hand case.** The twenty-row fixtures of §3.2–§3.4 with the value computed in the test by the arithmetic shown, asserted to four decimal places.
- **Planted effect.** A seeded generator with a known effect the metric must recover within a stated tolerance: a 6-point approval gap between two groups of 2,500 (demographic parity 0.06 ± 0.02, the interval containing 0.06); a ratio of 0.8 (disparate impact); a 6-point gap in the repaid subgroup only (equal opportunity), a 6-point false-positive gap only (equalised odds), a 6-point repayment gap among the approved (predictive parity); a 6-point gap inside each stratum with strata of different sizes (conditional parity), a 6-point agreement gap (rule agreement); 8% of 1,000 pairs discordant favouring one side (discordance recovers 0.08, the sign test p < 0.05); 5% of flips (counterfactual); a PSI of about 0.18 by moving one decile of mass (recovered within 0.04); a KS shift of 0.3 sd (p < 0.01); a 0.5-point-per-day ramp caught by Page–Hinkley within 12 days at δ = 0.005, λ = 0.05; an outcome-mix distance of 0.2; touches-per-case of 1.5 recovered from a Poisson draw; a breach rate of 0.1 planted.
- **Null.** A stationary, balanced generator — the same approval rate in every group, the same distribution in reference and current, a flat series — over **200 seeds** at *n* = 2,000 (5,000 in `docs/metrics.md`'s on-demand run), the false-alarm rate at the default thresholds recorded: an interval that excludes zero (or one, for the ratio) at 95% no more than 5% + a margin for the seed count (the binomial's own Wilson bound at 200 trials, ≈ 8.5%), and Page–Hinkley never raising on a flat series with noise σ = 0.02 under the defaults.

`docs/metrics.md` — generated by `npm run metrics:doc` from `suite.ts` (the package built), checked on `npm run build` like the schemas: a table per family — metric, definition, interval method, test, hand case (expected / got), planted effect (planted / recovered / tolerance), null rate (rate / bound / seeds / n).

## 5. The package

`packages/metrics` — `@craftabot/metrics`, browser- and Node-safe, `core` types only. `src/intervals.ts`, `src/tests.ts`, `src/normal.ts` (Φ, Φ⁻¹, the incomplete beta, the t quantile), `src/fairness.ts`, `src/drift.ts`, `src/human-load.ts`, `src/random.ts` (the validation PRNG, mulberry32), `src/validation/` (the generators, the suite, the tests), `src/index.ts`. `governance/reports/drift.ts` imports `totalVariationDistance` and keeps `mixDistance` as its name for it; the reference-window options, `psi:<feature>` series and the new flag kinds are WP82's.

## 6. Stage plan

- **Stage A** — this note. _Done 2026-09-10._
- **Stage B** — the package: the nine fairness metrics, the six drift metrics, the six human-load metrics, the intervals and tests; `driftIn` delegating with its snapshot unchanged. _Done 2026-09-10._ `packages/metrics` — `normal.ts` (Φ, Φ⁻¹ by Acklam without a Newton step through the coarser erfc, ln Γ, the incomplete beta, the t distribution), `intervals.ts` (Wilson exact at 0 and n, Newcombe, log-ratio with Haldane, Clopper–Pearson, the t and Welch intervals), `tests.ts` (two-proportion z, Fisher exact, the sign test by exact binomial arithmetic, Kolmogorov–Smirnov), `fairness.ts` (nine metrics; equalised odds at 1 − α/2 per component, Bonferroni, so its null holds), `drift.ts` (PSI numeric and categorical, KS, the outcome-mix distance, agreement and fairness drift, Page–Hinkley), `human-load.ts` (six metrics over `TouchedCase`), `confusion.ts` (precision, recall, F1, FPR with Wilson bands — the Fraud Desk's campaign test asserts they equal the report's). `governance/reports/drift.ts` `mixDistance` delegates to `totalVariationDistance`; its snapshot test is unchanged. ESLint holds the package to `core` alone.
- **Stage C** — `validation/`, `suite.ts`, `docs/metrics.md` and `npm run metrics:doc` with the build check. _Done 2026-09-10._ `validation/generators.ts` (seeded, mulberry32), `validation/suite.ts` (`validationReport({ seeds, n })` returning every metric's three results as data, `renderValidationReport`), `suite.test.ts` asserting every row green and the hand cases as §3 works them, `normal.test.ts` against tabulated values; `scripts/metrics-doc.mjs` writes `docs/metrics.md` from the built suite and `npm run build` runs its `--check`. Findings on the way, each now on the row or the code: the erfc fit's 1.2e-7 error made a Newton step on Φ⁻¹ worse, not better; a max-of-two statistic (equalised odds) needs Bonferroni or its null false-alarm rate exceeds α; a max − min metric's null sits above 0 by the sampling gap, so a fairness *drift* understates by that gap (the definition says so, the tolerance allows it); Wilson's lower bound at zero successes must be exactly 0, or every null with a floating whisker alarms; and the hand arithmetic in §3.2's first draft mis-stated the Wilson bounds (corrected above to what the table gives).

> **Amended 2026-09-11 (WP89, `72-…` §3).** The sign test's binomial tail is summed in log space past a thousand discordant pairs (`logChoose`): the product form overflowed and read NaN on an experiment's 4,000 shared items; up to a thousand the exact product stays, so the hand cases read 1 and not 0.99999…. `normal.test.ts` holds both.

## 7. Divergences from `64-…` §6.4

- The human-load metrics take a structural `TouchedCase` rather than `StageRecord`s, which do not exist until WP79; WP79 folds its stage records into `TouchedCase`s. `minutes-per-touch` is a table the host passes, because the package cannot depend on `fs-bank` for the row.
- Conditional parity's interval is the weighted sum of the strata's bounds rather than a pooled interval — conservative and simple; a pooled form is a later refinement if a reader asks for one.
- `fairness` drift's interval combines two half-widths in quadrature, a stated approximation.
