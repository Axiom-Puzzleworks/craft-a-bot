# 103 — Fallible actors: the provider cassette, the fallible tier, the reviewer model (WP114–WP116)

> **Status:** Phase AD's design of record, opened 2026-09-29 (`101-DAY7-ROADMAP.md` Phase AD; `100-TARGET-DESIGN-V7.md` §6.1–§6.2, decisions D14 and D15; G72, G73, G80). Stage A of WP114 — the cassette kind, the prompt digest, the tiers, the error model, the *untestable* verdict — for all three packages, so WP115 and WP116 build against it. WP114's stages B and C are recorded at the end; WP115's and WP116's in their own stage notes as they land. Awaiting Andrew's review; the build continues.

## 1. Where the code is (WP114)

- **`packages/core/src/schemas/provider-cassette.ts`** — `providerCassetteFileSchema` (`format: 'craftabot-cassette'`, `formatVersion: 1`, `kind: 'provider'`, `providerId`, `recordedAt`, `recordedBy`, `note?`, `egress`, `entries`), `providerCassetteEntrySchema` (`promptDigest`, `occurrence`, `model`, `response`, `latencyMs`), `promptDigest(request)`; `docs/schemas/craftabot-provider-cassette.schema.json`.
- **`packages/core/src/provider-cassette.ts`** — `createCassetteProvider(cassette)`, `recordingProvider(inner)`, `mergeProviderEntries(recordings)`, `ProviderCassetteMiss` (`kind: 'cassette-miss'`); `ProviderErrorKind` gains `'cassette-miss'`.
- **`packages/evals/src/campaign.ts`** — `campaignBrainSchema.cassette` (a live brain only), `RunCampaignOptions.cassetteFor(path)`, `providerFor(brain, { goalCardId })`, the budget not counting a cassette brain; the three cell paths through `providerForLive`.
- **`packages/harness/src/cassettes.ts`** — `cassetteLoader(root)`; **`commands/campaign.ts`** — `cassetteFor` on every run, `CampaignFileOptions.record`; **`commands/campaign-worker.ts`** — `cassetteFor` in the pool; **`commands/record-provider.ts`** — `recordExperiment`, `craftabot record --experiment <file> --provider <id|mock> [--size n]`.

## 2. Principles

1. **An actor that cannot err measures nothing** (tenet 33). Every reference experiment reads 100% against 100% because every tier plays the rule (`100-…` §2 fact 5). Phase AD gives the bank two actors that err — a real model replayed, and a scripted one erring at a cited rate — and a person who is a model.
2. **A replay is the recording.** A cassette answers every prompt with what the provider said to it, so a replayed run is the recorded run byte for byte, and CI replays a live experiment with no key.
3. **Every rate is a row** (`101-…` §5 rule 2). A fallible tier's error rate, a reviewer's accuracy: calibration rows with sources, `review: 'pending'`, never a literal.
4. **Planted is said.** A fault the fallible tier plants is an event beside the decision it corrupts; nothing reads a planted fault as a live one.

## 3. The provider cassette (WP114)

**The file.** The line cassette's shape (`47-…` §4.2) with `kind: 'provider'` in place of `lineId`: the provider's id (the replay presents it, so its trace is the recording's), when, by whom, a `note` saying in words what was recorded, the egress the recording ran under, and the entries. A sibling schema, not a union with the line cassette's: the three shipped line cassettes are untouched, and each reader parses what it expects.

**The key.** `promptDigest(request)` is SHA-256 (the synchronous `sha256Hex`, so the Worker and the harness key alike) over the canonical JSON of what reaches the provider — `model`, `messages`, `tools` (empty when absent), `temperature`, `maxTokens`. An entry also carries its **occurrence**: the how-many-th time *this provider* was asked this prompt, from 0. A replay provider counts the same way, so a prompt asked twice in a conversation gets its two answers in order.

**Scope of an occurrence.** One provider per cell (per agent stage in a book cell — `runWorkflow` asks `providerFor` per stage), for recording and replay alike. A recording over many cells merges with `mergeProviderEntries`: the first answer to each (prompt, occurrence) is kept; two cells that asked the same prompt the same number of times are the same conversation so far, and a provider that answered them differently is counted as a conflict and reported, not hidden.

**The model is pinned.** Every entry names the model that answered, and the digest includes it: the same prompt to another model is a miss.

**A miss.** A prompt the cassette has not seen throws `ProviderCassetteMiss`, which the session writes as `error { kind: 'cassette-miss' }` and ends the run `ERROR`. The replay provider has no `fetch` and declares no egress; the test stubs the global `fetch` and proves it is never called.

**Streaming.** The replay streams the recorded text in the mock provider's chunks, so `think.token` events are as a scripted run's.

**No trace field.** `100-…` §6.1 put `provider.cassette` on `think.completed`. A replay stamped so would differ from its recording, and the DoD asks that a replay reproduce the recording's trace digest; the two cannot both hold. Provenance lives where it does not touch the trace: the campaign names the brain's cassette, the report's cell names the brain, and the cassette's `note` says what it holds (§7).

## 4. The live tier at scale (WP114)

**A brain names its cassette.** `campaign.brains[]` gains `cassette: '<path>'`, allowed on a `live` brain only. `evals` never reads a disk: the host passes `cassetteFor(path)`, and all three cell paths (the single agent, the book's agent stages, the duo's agent seat) resolve a cassette brain through it to a fresh `createCassetteProvider`. A cassette brain spends nothing, so it does not count against `budget.maxLiveCells`; a live brain without one still does. The duo's counterpart seat has no cassette yet — a live seat is still live.

**Recording.** `craftabot record --experiment <design> --provider <id>` expands the design and runs every campaign as `campaign` runs one, in `record` mode: each brain naming a cassette runs live instead, through its cartridge's provider — whose id must be `--provider`, so a recording never calls a provider it was not told to — under the session's declared egress and the file's own budget. Each cell's calls are recorded; each cassette path gets one file, merged, **redacted against every credential the process holds**, and refused (nothing written) if a key survives. `--provider mock` records the scripted-optimal plans instead — no key, no network — and its `note` says it is *a stand-in, not a live model*; it is what the tests and a dry run use. One thread: `--jobs` is refused while recording.

**Replaying.** Any campaign or experiment naming the brain replays: `craftabot campaign`, `experiment run`, the `--jobs` pool (`campaign-worker.ts` loads cassettes too). The Workshop's Worker still refuses a live brain (`campaign-runner.svelte.ts`); a cassette brain in the Workshop needs the file served to the Worker, which is not in WP114.

**Temperature and seed.** A live tier's temperature is the cartridge's; the recording keeps what the provider said, so a re-run is byte-identical whatever the provider would say now. A provider `seed` parameter is not plumbed through `ChatRequest` today; the cassette makes it unnecessary for replay.

## 5. The fallible tier (WP115 — designed here, built there)

```ts
interface ErrorModel {
  id: string;
  /** Per decision stage (a workflow stage id, or a goal card's decision action), else the default. */
  stages?: Record<string, StageErrorSpec>;
  default: StageErrorSpec;
}
interface StageErrorSpec {
  /** A calibration row id whose `distribution.wrong` is P(the decision is wrong). */
  rate: string;
  /** Uniformly over the other options, or toward one (`over-approve`, `under-refer`). */
  direction: 'uniform' | { toward: string };
  /** Optional: the rate multiplied for cases whose truth carries this cohort value. */
  cohortFactor?: Record<string, number>;
}
```

- `PackManifest.errorModels`; `BrainChoice`/`campaign.brains[]` `{ tier: 'fallible', errorModel: '<id>' }`. The tier plays the desk's scripted-optimal plan and, at each decision the model names, draws from the session's `dice` stream (hard rule 5): wrong with the row's probability, toward the direction. The seed reaches it through the cell, so a seed plants the same faults.
- **`decision.fault { stageId, planted: true, chose, shouldHave }`** is written beside the `decision` it corrupts — a new event in `02-…` §7. An evaluator, the register and Explain can all see a fault was planted.
- The rows live in `fs-bank`'s calibration (a new table beside `BOOK_INCIDENCES`, for the same digest reason — `102-…` §2's sibling), cited from the literature on the task class where one exists, stated as assumptions where none does, `review: 'pending'`. The doc and every row's note say plainly that a planted rate stands in for the live tier's measured one.
- **Identity:** `scripted-optimal`, `scripted-noisy`, `scripted-adversary` byte-identical; a model at rate 0 is `scripted-optimal`.

## 6. The reviewer model and the *untestable* verdict (WP115, WP116)

- **`ReviewerModel`** as `100-…` §6.2 gives it — accuracy, automation bias, seconds per case, fatigue — each a calibration row; `WorkflowConfig.reviewer?`; the runtime's scripted person draws from the seeded stream; `stage.completed.by` carries `{ model: 'oracle' }` when absent (written only when a reviewer model is named, so every golden run is byte-identical) and `{ model, followed, correct, seconds }` with one. Human load v2 in `metrics`: cost (seconds by level), quality (accuracy, catch rate of the bot's faults), touches (counted once since WP111).
- **`untestable`** joins `experimentVerdictSchema` (`core/src/schemas/experiment.ts`): a comparison whose both sides sit at the metric's ceiling (or floor) with no discordant cell says nothing about the control, and reads *untestable* rather than *inconclusive* or *not-supported*. The register (`80-…`) names the tier beside every effect and labels an effect on a `derivedFrom` evaluator (`102-…` §7) as compliance with the rule.

## 7. Divergences and decisions

- **No `provider.cassette` on `think.completed`** (§3): it would make a replay differ from its recording. Provenance is the campaign's brain, the cell's brain id and the cassette's `note`.
- **A sibling schema, not a `kind` on the line cassette's**: the three shipped line cassettes and their readers are untouched; `docs/schemas/` gains `craftabot-provider-cassette.schema.json`.
- **`providerFor` gains a second argument** (`{ goalCardId }`), optional, so a recorder over the mock provider knows the card it plays; every existing host ignores it.
- **`createMockProvider` gains no cassette source** (`100-…` said it would): the cassette is a provider of its own, `createCassetteProvider`, used by every host the same way; the mock stays a testing tool.
- **The Workshop does not replay a cassette brain yet** (§4).

## 8. Stage notes

> **WP114 stage A, 2026-09-29:** this note.

> **WP114 stage B, 2026-09-29:** the provider cassette in `core` with its tests (`provider-cassette.test.ts`: a run recorded through the mock provider replays to the same trace digest; a miss is `cassette-miss` on the trace and `fetch` is never called; the model is pinned; the digest moves with any part of the prompt; the merge); the cassette brain through `evals`' three cell paths (`provider-cassette-campaign.test.ts`: every cell of the injection baseline recorded and replayed to the recording's per-cell trace digest with no provider and no network; the budget; the refusals); the harness's loader, record mode and `craftabot record --experiment` (`record-provider.test.ts`: `lending-stack` with a live cassette brain recorded through the mock at population 60, then run by `experiment run` under `--egress none` from the cassette alone, every cell answered, twice to the same result digest).

> **WP114 stage C — pending a key, 2026-09-29.** The live recording of `lending-stack` at reduced size needs an OpenAI key the build does not hold, and spends money: one command, for whoever holds the key, after giving the design a live brain (`{ "id": "live", "tier": "live", "cartridgeId": "<an OpenAI cartridge>", "cassette": "docs/evidence/lending-stack/lending-stack.provider-cassette.json" }` and a `budget`):
>
> ```bash
> CRAFTABOT_CREDENTIAL_OPENAI=… npm run craftabot -- record --experiment experiments/lending-stack.json --provider openai --size 200
> ```
>
> The cassette is committed under `docs/evidence/lending-stack/`, the synthetic sweep extended to it, and CI's reduced experiment run replays it with no key — WP116 adds the `live` level to every design, so the live column fills as each design is recorded. Until then the machinery is proved end to end on the mock stand-in, and no cassette in the repository claims to be a live model.

> **WP115 stage B, 2026-09-29 — the fallible tier:** `ErrorModel` (`core/types/error-model.ts`) with `PackManifest.errorModels` and the registry's `getErrorModel`/`getCalibrationTable`; `ChatResponse.fault` and the `decision.fault` event (`02-…` §7), the session writing it right after the brain's `decision`; the `fallible` tier and `scriptedFallible` in `evals` (one seeded draw per matched decision, the seed mixed from the cell's seed, ordinal and card; a field or the action itself swapped, uniformly or toward one option), `resolveErrorModel`; `fs-bank`'s `ERROR_RATES` (lending decision and fraud alert decision, 0.1 each, assumptions, pending); `fs-lending/error/decision` and `fs-fraud/error/alert-decision`. Tests: the planted rate within the Wilson interval over 5,000 cases, rate 0 is `scripted-optimal` turn for turn, both fault shapes, the direction, the resolution's refusals (`evals/src/fallible.test.ts`); the lending book under the fallible tier with every fault on the trace beside its decision and rule agreement falling where it was 100% (`fs-lending/src/fallible.test.ts`); the session's event with and without a named model (`core/src/session/decision-fault.test.ts`).

> **WP115 stage C, 2026-09-29 — the reviewer model and human load v2:** `ReviewerModel` on `WorkflowConfig.reviewer` and `PackManifest.reviewerModels`; `workflow/src/reviewer.ts` (`resolveReviewer`, `recommendationIn`, `reviewerRandom`, `reviewerAnswer`) called by `humanStage` ahead of any host resolver when a reviewer is named, from a stream of its own; `StageRecord.by`/`stage.completed.by`; `touchedCaseOf`'s `reviews`; `fs-bank`'s `REVIEWER_RATES` (accuracy 0.95, automation bias 0.3, seconds 60/120/240/480 at 20/45/25/10 — assumptions, pending) and `fs-bank/reviewer/case-handler`; a campaign build's `overrides.reviewer` and the cell's `workflow.reviews`; `metrics`' `reviewSecondsPerCase`, `reviewAccuracy`, `catchRate` with their validation rows and `docs/metrics.md`; the Monitor's `reviewers` option and `reviewLoad` readout. Tests: the oracle, accuracy, automation bias and seconds reproduced within the Wilson interval over 5,000 draws (`workflow/src/reviewer.test.ts`); on the lending journey, no reviewer writes nothing new, an oracle model takes the oracle's decisions with `by` on the record, the case handler answers every human stage and human load folds it (`fs-lending/src/reviewer.test.ts`); the Monitor's load against capacity (`evals/src/monitor.test.ts`).
>
> **Not built, and why:** `StageErrorSpec.cohortFactor` (a rate multiplied by cohort) — the fallible script sees the prompt, not the case's truth, so a cohort-conditioned error needs the cohort passed in; left for when a fairness experiment asks for it. The reviewer's **fatigue** row — the runtime has no shift hour to read; left with the Monitor's per-stage queues. **Error models for the advice, onboarding, disputes, collections and servicing desks** — advice decides by recommending a product from a shelf that varies by case, which has no fixed option set to swap; the others follow in WP116 as their designs gain a fallible level. **The Monitor's queues** are still the bot lanes'; `reviewLoad` reads demand against capacity, not a queue waiting on a person. The golden runs and every baseline are byte-identical: no shipped configuration names a reviewer, and no shipped brain is fallible.

> **WP116, 2026-09-29 — the register, regenerated.** The `brain` axis is a tier: `analyseExperiment` measures every other factor under each brain level and names it on the effect (`EffectRecord.tier`); an effect with both sides at a bound carries `untestable` and leaves the verdict; `untestable` is the fourth verdict. The register quotes a testable effect ahead of one at a bound, names the tier beside it, and reads a control whose every effect sat at a bound as `untestable`. Each of the seven designs gained a `fallible` level over its desk's error model (`fs-advice/error/recommendation` added — the product recommended swapped over the shelf) and the bank's case handler as the reviewer; `lending-stack`'s baseline moved to `bot-everywhere`; the lending four-eyes check learned to overturn (`StageSpec.recommended`, `73-…`'s note). `docs/evidence/` and `timings.md` regenerated at full size, `scripts/experiment-shape.mjs` keyed by tier.
>
> **What it found** (`docs/evidence/README.md`): every scripted-tier comparison is untestable; under the fallible tier the rules over the bot raise lending agreement from 91.3% to 100%, Level 5 breaches its ceilings in 63% of cases, a person at the decision takes agreement to 94.3% because the person errs too. **Not met: `lending-context`, `lending-fairness` and `fraud-stack` record no effect whose interval excludes zero** — the fallible tier changes an outcome and keeps the plan's reasons, and no card on those desks checks an outcome against the rule, the context rung cannot move a planted error, and the errors fall evenly across cohorts. The two things that would give them one — a card that checks the decision against the worksheet, an error model that errs by cohort — are not built. **The live level** waits on WP114 stage C: no design has a live brain until a cassette is recorded.
