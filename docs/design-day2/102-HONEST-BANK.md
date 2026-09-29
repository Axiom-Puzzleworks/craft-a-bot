# 102 — The honest bank: truth independence and the servicing audit (WP111)

> **Status:** WP111's design of record, opened 2026-09-29 (Phase AC, `101-DAY7-ROADMAP.md`; `100-TARGET-DESIGN-V7.md` §6.5 and decision D18; G75, G82-part). Written and built in one pass on the `day7` branch — the property, the servicing desk made honest, the audit of the seven desks — with the stage notes at the end. The disputes pair, report v4, `specFor` and the per-desk chunk are WP112's; the hosted guards WP113's.

## 1. Where the code is

- **`packages/pack-testkit/src/checks/desk.ts`** — `checkTruthIndependence`, run by `checkDesk` after the truth property: the checks `desk.truth-independent` and `desk.truth-derived`. **`types.ts`** — `DeskConformanceFixture.truthIndependence`, `TruthIndependenceFixture { leaf, ruleId, rule(state), rows }`. Proven against hand-written desks in `checks/desk.test.ts`.
- **`packages/desk/src/desk-world.ts`** — `DeskWorldSpec.derivedTruth?: Record<leaf, ruleId>`: the truth leaves a rule the desk runs computes by design.
- **`packages/core/src/types/evaluator.ts`** — `Evaluator.derivedFrom?: string`: the rule an evaluator's truth leaf is derived from. **`types/workflow.ts`** — `StageSpec.mayGoTo?: string[]`, for the Journey Canvas only (§4).
- **`packages/packs/fs-servicing`** — the category as the author's label (`world/cases.ts`'s profiles, `book.ts`'s cycle and the item's `payload.label`), `testing/labelled-rows.ts`, the property in `contract.test.ts`, `record` before `act` in `workflow.ts`.
- **`packages/workflow/src/human-load.ts`** — `touchesOf` counting a `human` stage once. **`journey.ts`** — `edgesOf` drawing a case edge to each of `mayGoTo`.
- **The five desks declaring derived truth** — `fs-advice`, `fs-lending`, `fs-onboarding`, `fs-disputes`, `fs-collections`: `derivedTruth` on each `world/desk.ts` spec, `derivedFrom` on the evaluator that scores agreement with the rule.

## 2. The property (`100-…` §6.5, D18)

**The shape it finds.** A truth leaf computed by a rule the desk also runs, and an evaluator scoring the bot against that leaf. The evaluator then measures agreement with the rule, and a bot that runs the rule scores 100% by construction. `98-JEV.md` §9 found it on the servicing desk: the truth's `category` was `classificationOf(subject)`, the regex the `classify-v1` stage runs, so `classified-correctly` rewarded the regex's misreads.

**The exact rule.** For each entry the fixture names — a truth leaf (a fact, `verdict`, or a truth record's field, `suitable-set.cheapest`), the rule's id as the workflow names it (`classify-v1`), the rule as a function over the desk as it opens, and a set of rows (a layout, its create-time config, a seed):

1. If the desk's spec declares the leaf derived from that rule (`derivedTruth[leaf] === ruleId`), the entry passes. A declaration naming another rule is `desk.truth-derived`.
2. Otherwise the rule must **disagree with truth on at least one row**. Agreement on every row is `desk.truth-independent`: the leaf is the rule's own answer.
3. No rows is `desk.truth-independent` too — an undeclared leaf with nothing to show it independent is not assumed so. A row whose truth lacks the leaf is named.

And for every desk, whatever the fixture: every leaf `derivedTruth` declares must be one some layout's truth carries (`desk.truth-derived`), so a declaration cannot rot into a name.

**Why disagreement and not a structural test.** The property cannot see how a generator computed a value, only what it produced. A rule that disagrees with truth on some row cannot be where truth came from; a rule that agrees everywhere may be, and the desk must then say so or produce the rows that show otherwise. The rows are the evidence, which is why they are labelled rows rather than the hundred seeds of the truth property: a desk's own generator writes requests its rule reads right (the five servicing subjects all classify correctly), so seeds alone would call an honest label circular.

**Rows until corpora exist.** The fixture carries its rows until `Corpus` is a content kind (WP119, `105-…`); then an entry's rows are the desk's corpus, and `checkCorpus` holds them to the corpus rules.

**Derived is honest when it is declared.** On five desks the truth leaf *is* a rule by design: a regulation's rule applied to the case's figures (affordability, CONC 7 forbearance, the PSR-shaped reimbursement rule, the screening lists and the rating, the suitability rule). There the truth is what the case requires, and "the bot followed the rule" is the right measurement — so long as nobody reads it as "the bot read the case right". `derivedTruth` on the spec says which leaves are so and which rule wrote them; `derivedFrom` on the evaluator says its pass means *the rule was followed*. WP116's regenerated register reads `derivedFrom` so that an effect on such a metric is labelled compliance with the rule, not correctness (§7).

## 3. The servicing desk made honest

- **The label is the author's intent.** Each of the five case profiles (`world/cases.ts`) and the five requests of the book's cycle (`book.ts`) carries the `category` its author meant; `assembleServicingCase` takes it as `AssembleOptions.category`, and the book writes it to the item as `payload.label.category` and to the item's truth. The rule reads the same five subjects the same way, so no figure moves — but the truth no longer comes from the rule, and a subject rewritten to trip the regex now scores as a misread.
- **An unlabelled item still falls back to the rule** — a handoff from collections, an item from another host. That path is exactly what the property shows up: `contract.test.ts` runs it over eight labelled rows (`testing/labelled-rows.ts`), two of which the regex reads wrong ("Since my husband died the statements should go to my new flat" is an address change, not a bereavement). With the labels the property is green; with the labels stripped it is red, `rule "classify-v1" agrees with truth fact "category" on all 8 rows`.
- **`act` is not derived from the classifier.** The truth's act is `actFor(label)` (with the caller and the authority on file); the desk's `act-v1` applies `actFor` to the category the *desk* reached. They part when the classification is wrong, which is the point of `needs-met`.
- **`discloses` and `callerIsCustomer`** were independent already (the profile's disclosure; the given details against the customer record).

## 4. The servicing order

`fs-servicing/servicing` ran `act` before `record`; `disclosure-recorded` demands the record before the act, so every need disclosed alongside a request failed under every reader (`98-…` §9 finding 1: 13 of 13). The journey now runs **verify → record → act**: the verification goes to the record for every category but bereavement (which still goes to four eyes, then the record, then the closure), and the record goes to the act unless the category has none (a disclosure) or the act is done. The evaluator is unchanged. A test (`workflow.test.ts`, *a need disclosed mid-call is recorded before the act*) runs an address change with a job loss disclosed under `rules-only` and `bot-everywhere` and holds the order and the act.

**The drawing.** The Journey Canvas (`87-…` §3.3) draws a stage whose `next` reads the case as one *depends on the case* edge to the stage declared after it. With the record now choosing between the act, the closure, the end and the collections handoff, that heuristic would have drawn an act → closure edge that no run takes. `StageSpec.mayGoTo` names the stages such a `next` may reach, and `edgesOf` draws one case edge to each; the runtime never reads it. The servicing journey declares it on `record`, `act` and `close`. The harness's journey snapshot is re-taken (§8).

## 5. The audit of the seven desks

Leaves are named as the property names them; *agreement evaluator* is the one that scores the bot against the leaf.

| Desk | Leaf | Source | Finding | Agreement evaluator |
|---|---|---|---|---|
| Servicing | `category` | The author's label (profile, book, item) | **Was the rule** (`classify-v1`); now independent, the property green on labelled rows | `classified-correctly` — now against the label |
| Servicing | `act`, `discloses`, `callerIsCustomer` | `actFor(label)`; the profile; the given details | Independent | `needs-met`, `disclosure-recorded` |
| Advice | `suitable-set.product_ids`, `.cheapest`, `suitableCount` | `suitableProducts`/`cheapestOf` — `recommendation-v1`'s rule | **Derived**, declared: COBS 9A's rule over the answers and the shelf is what the case requires | `recommendation-suitable` → `derivedFrom: 'recommendation-v1'` |
| Advice | `vulnerable`, `discloses`, `needed`, the cohort | The persona, the kind, the required topics | Independent | `vulnerability-actioned`, `data-minimised` |
| Complaints | `finding.*`, the redress bounds, the timescales | The static profiles | Independent — and the workflow's own tables disagree with them on two kinds (`advice`, `service`), so the journey's rules-only decision is scored against something it did not write. The item path reads `fs-bank`'s `UPHELD`, a copy of the workflow's `UPHELD_CATEGORIES`: coupling through a copied constant, noted, not a shared function | — |
| Fraud | `alert-truth-*.label`, `focalLabel`, `callerIdentity` | Hand-built alerts; the population's planted label | Independent; `decision-v1` holds everything and computes no label | `alert-decision`, `queue-decisions` |
| Lending | `verdict`, `shouldRefer`, `verdict.label`, `verdict.reasons` | `verdictFromFigures` — `decision-v1` | **Derived**, declared: the affordability rule is the policy. The independent outcome is the book's `performance.defaultedWithin12m` label, read today only by `metrics`' fairness fold — the thing a lending experiment should score against once the fallible tier exists (WP115–WP116) | `decision-matches-rules` → `derivedFrom: 'decision-v1'` |
| Lending | `verdict.ratio` | The affordability computation — `affordability-v1` | **Derived**, declared | — |
| Onboarding | `verdict`, `verdict.label`, `verdict.reasons` | `onboardingVerdict` — `decision-v1` | **Derived**, declared | `decision-matches-rules` → `derivedFrom: 'decision-v1'` |
| Onboarding | `hit`, `the-lists.list`; `rating`, `the-lists.rating` | The lists (`screening-v1`); the rating (`risk-rating-v1`) | **Derived**, declared; `hit-contained` scores containment of the hit, not agreement, and is not marked | — |
| Disputes | `verdict`, `verdict.label`, `verdict.reasons`; `classification`, `verdict.classification` | `disputeVerdict` — `decision-v1`; `classificationOf` over the claim's *figures* — `classify-v1` | **Derived**, declared. Unlike servicing's, this classifier reads structured figures (who made the payment, the channel, a new payee), not words, so it is the policy rather than a reading | `decision-matches-rules` → `derivedFrom: 'decision-v1'` |
| Collections | `verdict`, `verdict.label`, `verdict.reasons` | `verdictFromFigures` — `plan-v1` | **Derived**, declared; `discloses` is the profile's or the item's label, independent, and `vulnerability-actioned` scores against it | `plan-matches-rule` → `derivedFrom: 'plan-v1'` |

**What it comes to.** One desk had truth written by the rule under test — the only desk whose rule *reads words*. The other rule-computed leaves are rules applied to figures, which are what the case requires; they are now declared, and the five evaluators that score agreement with them say so. That leaves every desk's agreement metric honest about what it measures, and names the gap it leaves: on the lending, onboarding, disputes and collections desks, nothing yet scores the bot's *reading* of a case, because every input the rule reads is a figure the desk shows. The classify-shaped stages that read words are where WP117's readers and WP121's corpora go.

## 6. `touches`

`touchesOf` counted a `human` stage answered with other than its first option twice — `human:<stage>` and, because the runtime marks such an answer `escalated`, `escalated:<stage>` (`98-…` §9 finding 3). A person's answer is one touch whatever it was: `escalated:` is now counted only for a stage of another kind. The fold in `@craftabot/metrics` is unchanged; it counts what it is given.

**Against the branch's figures.** `servicing-jev` (`packages/packs/typesafe/experiment/servicing-jev.json`) re-run offline from its cassette on `day7` (2026-09-29): the review touches are **5 at 0.80** (two classification reviews, three need reviews) and **10 at 0.90** (seven and three) — the counts `98-…` §9 finding 3 gave by hand. Touches per case read 0.211 and 0.263 against the ungated reader's 0.168 (were 0.263 and 0.358); each is one short of the reviews added because a review that corrected a misread bereavement took one four-eyes confirmation out. The same re-run shows the order fix: `disclosure-recorded` reads **100%** under Jev and 68.4% under the regex (were 86.3% and 63.2%). The lab record's own results under `packages/packs/typesafe/experiment/out/` are left as recorded on 2026-09-28; WP119 re-runs and moves them.

## 7. Divergences and decisions

- **`derivedTruth` is on the desk's spec, not in `truth()`** (`100-…` §6.5 says "declared on the world's `truth()`"). Truth is written to `run.finished.truth`, so a declaration there would change every golden trace on five desks for a fact that does not vary by case. On the spec it is static, read by the kit as `purpose` is, and no trace moves.
- **`derivedFrom` is on the evaluator, not on each evaluation record** (`100-…` says "marked `derived` on the record"). Every record an evaluator writes would carry the same flag, and the campaign reports' bytes would change for it. The register and the assurance pack resolve evaluator ids through the registry already; WP116 reads `derivedFrom` there when it regenerates the register, and labels such an effect *compliance with the rule*.
- **The property's rows are the fixture's** until WP119 (§2).
- **`StageSpec.mayGoTo`** is a `core` addition the design did not name (§4): additive, optional, read only by the drawing.
- **The float rounding in the readers' outputs** named in `101-…`'s WP111 row was already on `main` (the typesafe and DGX Spark packs round at source, `100-…` §2 fact 4); nothing to do.

## 8. Tests, and what moved

- `pack-testkit/src/checks/desk.test.ts` — the property green on an independent desk, red on an echoing one, green once it declares the leaf derived; the three `desk.truth-derived`/no-rows messages.
- `fs-servicing/src/contract.test.ts` — the property green with the label hook and red without it; the conformance fixture carries the entry.
- `fs-servicing/src/workflow.test.ts` — the record before the act on a mid-call disclosure; the journey's edges from the verification and the record.
- `workflow/src/human-load.test.ts` — a `human` stage escalated counts once; an agent stage escalated counts as an escalation.
- Every desk's `checkDesk` run validates its `derivedTruth` names against its truth.
- **What moved:** the servicing journey's stage order (its drawn journey, `harness/src/__snapshots__/journey-fs-servicing-servicing.json`, re-taken) and its book items (`payload.label`). No other desk's golden run, trace or baseline changed.

## 9. Stage notes

> **Stage A, 2026-09-29:** this note — the property's exact rule (§2), the declaration and where it lives (§7), the audit method (§5: the leaves by source, the evaluator that scores each).

> **Stage B, 2026-09-29:** the property in `checkDesk` with its kit tests; the servicing label on profiles, book and items; `record` before `act` with `mayGoTo` for the drawing; `touches` counted once.

> **Stage C, 2026-09-29:** the seven desks audited (§5): servicing independent under the property; advice, lending, onboarding, disputes and collections declaring their rule-computed leaves with the agreement evaluators marked; complaints and fraud independent. A dated note in each desk's doc points here.
