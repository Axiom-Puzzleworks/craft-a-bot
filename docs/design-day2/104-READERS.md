# 104 — Readers: typed questions, the `reader` executor, the rule readers, calibration, the hosted and LLM readers (WP117, WP118, WP120)

> **Status:** Phase AE's first design of record, opened 2026-09-30 (`101-DAY7-ROADMAP.md` Phase AE; `100-TARGET-DESIGN-V7.md` §6.3, decision D16, tenet 35; G74 part, G81). Stage A of WP117: the contract, the confidence formula, the executor and its gate, the event, and the rule adapter's exact wrap. WP117's stages B and C and WP118 are recorded in §8 as they land. Awaiting Andrew's review; the build continues.

## 1. Where the code is (WP117)

- **`packages/core/src/schemas/reader.ts`**: the question and answer schemas, the reader response and the stage's reader record, `readerConfidence`, `roundProbability`; `docs/schemas/reader.schema.json`.
- **`packages/core/src/types/reader.ts`**: `Reader`, `ReaderContext`.
- **Core registration**: `PackManifest.readers`, the registry's `getReader`/`listReaders`, `Executor { kind: 'reader' }`, the executor record's `reader` shape, `StageRecord.reader`, and the event `reader.answered`.
- **`packages/governance/src/readers/rule.ts`**: `ruleReader`.
- **`packages/workflow/src/run.ts`**: the executor. `workflow/src/reader.ts` holds the gate and `withoutReaders`, the identity's projection.
- **`packages/pack-testkit/src/checks/reader.ts`**: `checkReader`.
- **The rule readers**: `fs-servicing` (classification, support need), `fs-disputes` (classification) and `fs-advice`'s complaints (root cause). Each has its reader executors and an identity test.

## 2. Principles

1. **A judgment is a typed question with a calibrated answer** (tenet 35). A desk's regex is one answer to *which category is this call?*, and a hosted classifier or a chat model is another. The stage should not care which reader answered, and a gate should read the same confidence from each.
2. **The rule is one reader among several.** It answers at confidence 1 because it claims certainty, not because it has earned it. That is exactly why a gate never stops it, and why its accuracy against a labelled corpus (WP121) is the baseline every other reader is measured against.
3. **The truth is never a reader.** No reader reads `truth`. A reader sees what its executor shows it (`subject`), and an evaluator scores the answer against truth afterwards.
4. **Identity before novelty** (`101-…` §5 rule 1). A rule reader fitted where a rule was produces the same outputs, acts, world and outcomes. The only additions are what the record says about the reader.

## 3. The contract

### 3.1 Questions and answers (`core/schemas/reader.ts`)

The three question types are TypeSafe's (`98-JEV.md` §2), because the branch showed they cover the bank's judgments:

```ts
type TypedQuestion =
  | { type: 'choice'; instructions: Json; criteria: Record<string, Json> }  // 2–255 options, keyed
  | { type: 'noul';   instructions: Json; criteria?: { true?: Json; false?: Json } }
  | { type: 'score';  instructions: Json; criteria: Json[] };               // 2–10 ordered levels

type TypedAnswer =
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number | null }
  | { type: 'noul';   noul: number }                                          // P(true)
  | { type: 'score';  score: number; probabilities: number[]; confidence: number | null };
```

**Diverged from `100-…` §6.3:**
- Answers carry `type`, as Jev's wire shape does, so one answer parses without its question.
- A score's `legend` is dropped: the question's `criteria` already are the legend, in order.
- A score's `probabilities` is an array over the levels, where Jev's is a record keyed by level index. A hosted adapter maps one to the other (WP120).
- `criteria` values are any JSON, not `string | null`, because Jev accepts structured criteria and the bank's questions use strings anyway.

### 3.2 Confidence

`readerConfidence(probabilities)` is one formula for every reader:

`(n·p_max − 1) / (n − 1)`

Here `n` is the number of options and `p_max` is the largest probability. It is 0 when the distribution is uniform and 1 when all the mass is on one option. It is TypeSafe's formula, adopted so that a threshold is the same function of the distribution whoever answered (`99-…` §4). It is clamped at 0 below and 1 above, so rounding cannot push it outside the unit interval.

- **Choice and score answers:** the formula is computed over the answer's own probabilities.
- **Noul answers:** a noul has no confidence. It is itself a probability, and a gate reads it as a steer (§4.2), never as a confidence.
- **`confidence: null`:** a reader that returns no distribution (an unconstrained chat model read by argmax, WP120) answers with `null`. A gate treats `null` as below every threshold.

**Six places.** `roundProbability` rounds each probability, and the confidence, to six decimal places before anything records it. Full doubles in a corpus row read as PANs to the synthetic sweep (`100-…` §6.3), and six places is below any threshold a person would set.

### 3.3 The reader (`core/types/reader.ts`)

```ts
interface Reader {
  id: string; name: string; description: string;      // qualified: '{packId}/reader/{local}'
  kind: 'rule' | 'hosted' | 'llm' | 'human';
  egress: EgressDeclaration[]; credential?: CredentialKind; browserCapable: boolean;
  answers: ('choice' | 'noul' | 'score')[];
  ask(subject: unknown, questions: Record<string, TypedQuestion>, ctx: ReaderContext): Promise<ReaderResponse>;
  createOffline?(): Reader;
}
interface ReaderResponse {
  model: string;                                       // what answered: 'regex', 'jev-1.13.0', 'openai/gpt-…'
  method: 'rule' | 'hosted' | 'constrained' | 'logprobs' | 'argmax' | 'human';
  answers: Record<string, TypedAnswer>;
}
interface ReaderContext { fetch?: typeof fetch; credential?: string; signal?: AbortSignal }
```

**Diverged:**
- `ask` returns the `model` and the `method` beside the answers. `100-…` put the method on the context, but the record needs to know which model answered and how, and only the reader knows.
- The first argument is called `subject`, the thing the reader is shown, not `state`. The rule readers read a string or a claim's figures, never the world.

**Registration.** `PackManifest.readers` holds a pack's readers. The registry indexes them with `insertUnique`, as it does error models, and provides `getReader(id)` and `listReaders()`. A reader is content with behaviour, like a guardrail component. The contract is `core`'s, and a pack only fills it in (hard rule 4).

## 4. The `reader` executor

```ts
| {
    kind: 'reader';
    readerId: string;
    /** What the reader is shown: the caller's words, a claim's figures. Never truth. */
    subject: (input: unknown, state: WorldState) => unknown;
    questions: (input: unknown, state: WorldState) => Record<string, TypedQuestion>;
    /** The stage's output from the answers. */
    output: (answers: Record<string, TypedAnswer>, input: unknown) => unknown;
    /** What committing the output does on the desk (the rule's `call`), if anything. */
    act?: (output: unknown, input: unknown, state: WorldState) => ActionCall | undefined;
    gate?: { threshold: number; else: Executor /* rule or human */; steer?: string };
  }
```

### 4.1 One stage, in order

1. `stage.started { executor: 'reader' }` is written.
2. **The reader is resolved.** An unknown reader, or a question type the reader does not declare in `answers`, ends the stage as an `error` with the finding.
3. **The reader is asked** `ask(subject, questions, ctx)`, and the answers are checked and rounded (§3.2). If the reader throws, or answers the wrong type or a choice outside the criteria, the stage is an `error`. It does not fall through to the gate's `else`: a broken reader is a defect, and a low confidence is not.
4. **The gate is read** (§4.2). `reader.answered { workflowRunId, stageId, readerId, model, method, questionIds, answers, confidence, gated, steer? }` is written.
5. **Not gated:** `output(answers, input)` is validated against the stage's output schema. `act`, if it returns a call, is performed as a rule's call is, and the stage completes `ok`.
6. **Gated:** the `else` executor runs on the same input as the stage's own, under the same `stage.started`. So a gated stage is one stage in the record, not two. Its output, approval and `by` are the `else` executor's.

`StageRecord.reader` records `{ readerId, model, method, confidence, gated, steer?, answers }`. The executor record is `{ kind: 'reader', readerId, gate?: { threshold, else, steer? } }`, where `else` is the rule's or the person's own record. The Pipeline's stage card shows the answer, the confidence and whether the stage gated.

**Diverged:**
- `subject` and `act` are new. `100-…` had the questions read everything, and had no way to commit the answer on the desk. A rule executor's `call` is how the bank's classify stages act, so the reader executor needs the same.
- The gate's `else` is a `rule` or a `human`, as `100-…` says, and nothing else: an agent stage would need a second session under the same stage, and no desk asks for one.

### 4.2 The gate

- **Confidence:** the gate reads the lowest confidence among the stage's choice and score answers. The steer noul, if one is named, is left out. `100-…` has one threshold per stage, and a stage that asks two things should act only when it is sure of both.
- **Routing:** the stage runs `else` when any of these hold:
  - that confidence is `null` or below `threshold`;
  - `steer` is named and its noul is at or above 0.5 (`STEER_THRESHOLD`, the branch's even split fixed in advance, `98-…` §11). The steer routes independently of confidence.
- **No gate:** the reader's answer is committed whatever its confidence.

**A rule reader never gates.** Its confidence is 1 and it answers no noul, so no threshold can stop it. The identity (§6) depends on this, and `checkReader` holds it.

## 5. The rule adapter (`governance/readers/rule.ts`)

```ts
ruleReader({ id, name, description, rules: Record<questionId, (subject) => string | boolean | number> })
```

- **Choice question:** the rule's string is the choice. It must be one of the criteria's keys, otherwise the reader throws. The probabilities are 1 on the choice and 0 elsewhere, over every key in the criteria's order, and the confidence is 1.
- **Noul question:** the rule's boolean is the noul, 1 or 0.
- **Score question:** the rule's number is the level index, with a one-hot distribution and confidence 1.
- **Declared types:** `answers` lists the types the rules return, inferred from the questions the reader is asked.
- **What it declares:** `kind: 'rule'`, `egress: []`, `browserCapable: true`, `model: 'rule'`, `method: 'rule'`.
- **Unanswerable questions:** a question id the reader has no rule for is an error, not a guess.

## 6. The identity

The shipped configurations keep their `rule` executors, so every desk golden run, golden workflow run and campaign baseline is byte-identical without further argument: nothing they run has changed.

**Diverged.** `101-…` asked for them to be "byte-identical with rule readers fitted". A workflow run that records a `reader` executor and a `reader.answered` event cannot also be byte-identical to one that recorded a `rule`, and a record that hid the reader to stay identical would lie. So the identity is stated over what the reader changes, and each desk's test proves it over a book. With a desk's rules swapped for its rule readers, `withoutReaders(run, stageIds)` of the reader run equals the same projection of the rule run, byte for byte, where `stageIds` are the stages the readers were fitted to. What `withoutReaders` removes is exactly what a reader adds:
- the `reader.answered` events;
- `StageRecord.reader`;
- the executor records and `stage.started.executor` of the stages the reader took.
- every id and time. The extra event takes an id and a timestamp from the host's counter and clock, which shifts every one after it, the agent runs' included.

Everything else is held: every stage's input and output digests, every act, every approval, every item's outcome, every event each agent run's session wrote (the workflow's own `stage.*` events on an agent trace keep their place and payload; their workflow-stamped id and time are the shifted ones above), the ledger and the handoffs. A second assertion shows the projection hides no more than that: the two runs differ, and they differ only in those fields.

## 7. Stage C: which rules, and which not

The classify-shaped rules `100-…` §6.3 names, as found:

| Desk | Stage | Rule | Reader | Question |
|---|---|---|---|---|
| Servicing | `classify` | `classificationOf(subject)` | `fs-servicing/reader/category` | `category`, choice over the five categories |
| Servicing | `record` | `needIn(subject)` | `fs-servicing/reader/support-need` | `need`, choice over the four needs |
| Disputes | `classify` | `classificationOf(claim figures)` | `fs-disputes/reader/classification` | `classification`, choice over the three |
| Complaints | `root-cause` | `rootCauseOf(category)` | `fs-advice/reader/root-cause` | `cause`, choice over the root causes |

**The fraud desk's coaching markers are not a rule.** Whether a caller is being coached is a truth fact (`facts.coached`) read only by an evaluator, and no stage of the fraud journey classifies the call. There is nothing to wrap. A reader that tries to answer *is this caller coached?* from the call's words is a reader with no rule baseline, and it belongs to WP121's fraud corpus. The remaining desks (lending, onboarding, collections) decide by rules over figures (affordability, screening, disposable income), not by reading words, and `100-…` does not name them.

## 9. Calibration and the report's pane (WP118)

**The metrics** (`metrics/src/calibration.ts`). A reading is `CalibratedAnswer`: the choice, the label, the distribution, the gate's confidence and the steer if one was asked. There are four figures, each a pure function:
- `reliability(answers, { edges })`: the answers binned by the probability the reader put on its own choice. Each bin has its mean stated probability and its accuracy with a Wilson interval. The bins default to ten of equal width (`TEN_BINS`), and the last bin includes its top edge.
- `expectedCalibrationError`: Σ (n_b/n)·|p̄_b − acc_b|, with a seeded percentile bootstrap interval (500 resamples). ECE is biased upward in a finite sample, so whether a reader is miscalibrated is a separate question, answered by `calibrationTest`: a Wilson interval per bin, Bonferroni-corrected over the non-empty bins.
- `brierScore`: multi-class, Σ over options of (p − [label])², averaged over the answers, with a t interval.
- `gateCurve(answers, thresholds)`: at each threshold, the share reviewed and the accuracy of the rest, read exactly as the gate reads (§4.2). The defaults are `0, 0.6, 0.8, 0.9, 0.95, 0.99`.

Each has a hand case, a planted case and a null in the validation suite, under the fourth family, *calibration*. The generator is `calibratedAnswers`: a two-option reader whose confidence is uniform and whose accuracy is its stated probability less a planted gap.

**The branch's figures, recomputed.** `packages/packs/typesafe/src/calibration-recompute.test.ts` reads Jev's v1 answers from the shipped cassette and scores them against the v1 corpus with these functions, making no call:
- ECE 0.0225 (request) and 0.0142 (need), and Brier 0.0137 and 0.0218, equal to `experiment/results.json` to twelve places. Published to three places, these are 0.023 / 0.014 and 0.014 / 0.022.
- The gate's counts at every threshold the branch read, also equal.

The branch binned by its own edges (`0, 0.5, 0.7, 0.8, 0.9, 0.95, 0.99`). The product's ten equal bins give the same ECE on this corpus: Jev's stated probabilities fall in the same bins either way.

**The answer key.** `StageSpec.answerKey?(truth)` gives the right answer to each question the stage's reader asks. It is read by the scorer (`evals`) after the run, from the case's truth, never by the runtime. No reader and no run record sees it, so truth stays where tenet 13 keeps it. Four stages have one:
- servicing's `classify` and `record`, from `facts.category` and `facts.discloses`;
- disputes' `classify`, from `facts.classification`;
- complaints' `root-cause`, from the truth record `finding.root_cause`.

**The report.**
- **The cell:** a book cell carries `workflow.readings`, one per choice answer at a reader stage, with its label when the stage has a key (`readingsOf`).
- **The summary:** gains `calibration`. It has one row per build, brain, stage, question and reader, with the accuracy, ECE, Brier, the reliability table and the gate curve, every figure a call into `@craftabot/metrics`. The field is defaulted, so every stored report parses, and a campaign with no reader stage has an empty pane.
- **The report version:** stays v4, since the change is additive.
- **Markdown:** the scorecard renders a *Calibration* section.
- **The Workbench:** the Campaigns screen mounts `CalibrationPane` beneath *Human load*.

> **WP118 done 2026-09-30.**
>
> **DoD:**
> - The branch's published figures are recomputed from its cassette to the same values ✓.
> - The validation suite is green, with the four calibration rows in `docs/metrics.md` ✓.
> - The pane is on the report and in the Workshop's campaign view ✓, rendered by a component test.
> - **Not met: the pane on the visual pass.** The visual pass runs a campaign in the Workbench, and no configuration the Workbench ships names a reader. The shipped configurations stay as they were (§8), and adding one would move the Monitor's default and the journeys page. The shot lands with WP120's reader configurations on the servicing journey.
>
> **Diverged:**
> - `100-…` put the calibration pane on "report v4" as if v4 were new. It was already v4 (WP112), and the pane is an additive, defaulted field.
> - The answer key is a new optional `StageSpec` field. `100-…` never said where a reader's label comes from.
>
> **Budgets.** The main bundle is +20 kB (2,300,000) and the Worker +10 kB (1,190,000) for the calibration fold and the pane (`scripts/bundle-budget.mjs`). The build found them 7 kB and 2 kB over.

## 10. The hosted and LLM readers, and the packs on the contract (WP120)

### 10.1 What the runtime hands a reader

`ReaderContext` grows two fields the runtime fills. A rule reader uses neither.

- **`callLine(lineId, operation, args)`** calls a registered service line through the same synthesised tool a `line` stage calls, returning its `ToolResult`. A line in cassette mode therefore replays exactly as the old line stages did: the same arguments give the same digest and the same recorded answer. A live line goes through the session's egress-guarded `fetch`, and a miss is `cassette-miss`, never a call.
- **`provider`** is the `LLMProvider` an `llm` reader asks. It comes from `RunWorkflowOptions.readerProvider?(reader)`, if the host gives one. Otherwise the reader must carry its own.

### 10.2 The provider seams (core)

- **`ChatRequest.choice?: string[]`:** asks the provider to constrain its answer to exactly one of these strings (OpenAI's `response_format`, vLLM's `structured_outputs.choice`).
- **`ChatRequest.topLogprobs?: number`:** asks for the first token's top log-probabilities.
- **`ChatResponse.logprobs?: { token, logprob }[]`:** the first token's, when returned.
- **`LLMProvider.supports?: { choice?: boolean; logprobs?: boolean }`:** a provider that does not say is asked for neither.
- **The mock provider** declares both when its options say so, and a `MockTurn` carries its `logprobs`.
- **What stays the same:** OpenAI and the other shipped providers declare nothing yet, so an `llm` reader over them reads by argmax. Their constrained and log-probability paths are written with the live checkpoints (WP125), where a key can hold them to the provider's real behaviour.

### 10.3 The adapters (`governance/readers/`)

**`hostedReader({ id, lineId, operation, request, egress, … })`** asks a service line whose operation answers the contract in Jev's wire shape. `request(subject, questions)` builds the line's arguments. The answer comes back as a `ReaderResponse` with `method: 'hosted'` and the line's `model`:
- a choice and a noul pass through;
- a score's record of probabilities, keyed by level index, becomes the contract's array.

**`llmReader({ id, model, provider?, systemPrompt?, … })`** asks one completion per question at temperature 0. The user message is `{ state, question, options }`, where the options are:
- a choice's criteria;
- `yes`/`no` for a noul;
- the level indices for a score.

What the answer carries depends on what the provider supports:

| Provider supports | Asked | The answer |
|---|---|---|
| `choice` and `logprobs` | constrained, top 20 | the first token's mass folded onto the options it begins (split evenly when it begins several), normalised: `method: 'logprobs'` |
| `choice` only | constrained | all the mass on what it said, `confidence: null`: `method: 'constrained'` |
| neither | free text | the option its text names (exactly, else the one key it contains), one-hot, `confidence: null`: `method: 'argmax'`; text naming no option or several is an error |

- A noul is P(`yes`).
- A score is the level with the most mass.
- The response's `method` is the weakest any of its answers used.
- The fold is `foldFirstToken(options, top)`, exported for the DGX pack's classifier, which now uses it instead of its own copy.

**The reader as a guard** (`governance/components/reader.ts`): `readerComponent` fits one noul at a declared point.
- **The subject:** the prompt at `pre-think`, the proposed call at `pre-act`, the stage's value at `stage-in`/`stage-out`.
- **The verdict:** `block-action` (or `annotate`) when P ≥ the config's threshold, `allow` otherwise.
- It carries its reader's egress and connection, and `checkComponent` holds it.

### 10.4 The packs

**`@craftabot/pack-typesafe`, collapsed onto the contract.** Each judgment is now two stages:
- **The reader stage** (`classify`, `record`): a `reader` executor with its question set named. Its `gate.else` is a person answering from truth, as the branch's reviewer did. A q2 configuration names the `steer` noul on the gate.
- **The commit** (`classify-commit`, `record-commit`): it performs the person's decision. When the reader acted, it passes the reader's answer through.

Before, each judgment was four stages: read, gate, review, commit. The readers are content:
- `typesafe/reader/jev` over the Jev line;
- `typesafe/reader/spark-122b` and `typesafe/reader/spark-35b` over the DGX classifier line, with the model directory in the request, as recorded;
- the regex configurations read with `fs-servicing`'s own rule readers.

Every recorded call replays: the reader builds exactly the arguments the line stages built.

**The identity.** The effects each experiment measures (the request and the need read right, the need detected, the disclosure recorded, the needs met, the touches) must be the ones WP119 pinned, value for value. The result digests move, because the stages are named differently, and the pins are re-taken.

A person's review counts once:
- `touchesOf` counts a gated reader stage whose `else` is a person as one `human:` touch;
- it no longer counts that stage as `escalated` when the person differs from the first option.

**`@craftabot/pack-readers-llm`** (new, optional):
- `llmReader` bound to a cartridge's provider through the host's `readerProvider`;
- one shipped reader, **`readers-llm/reader/mock`**, over a deterministic mock model that picks the option whose key or first criterion word appears in the state. It is a stand-in so the path runs in CI with no key and no network, and its name and description say it is not a model.

The typesafe journey's **`llm-mock`** configuration reads with it.

**`@craftabot/pack-dgx-spark` leaves the harness's default list** (G90). It is opt-in by `packages/packs/dgx-spark/craftabot.config.mjs`, and the typesafe pack's config installs it with Jev. Its classifier line keeps its transport and its recorded cassette, and folds log-probabilities through `foldFirstToken` (`99-…` amended).

**Neither optional pack is in any edition.** The Workbench imports neither, and a test over the built editions checks their ids are absent.

## 8. Stage notes

> **WP117 stage B done 2026-09-30.**
> - **The contract** is in `core`:
>   - the question and answer schemas, `readerConfidence`, `roundAnswer`, `answerProblem`;
>   - `readerExchangeSchema`, generated as `docs/schemas/reader.schema.json`;
>   - `Reader`, `PackManifest.readers`, and the registry's `getReader`/`listReaders`;
>   - `ReaderExecutor` and `ReaderGate`, the executor record's `reader` shape, `StageRecord.reader`, and `reader.answered` (`02-…` §7).
> - **`ruleReader`** is in `governance/readers/rule.ts`.
> - **The executor** is in `workflow` (`run.ts`'s `readerStage`). Its pure half is in `reader.ts`: `resolveReader`, `checkedAnswers`, `readGate`, `readerRecordOf`, `STEER_THRESHOLD` and `withoutReaders`.
> - **`checkReader`** is in `pack-testkit`, with seven checks.
> - **The Workbench:**
>   - the Pipeline's stage card shows the reader's line;
>   - the executor roundel is `lens`;
>   - the Boundary's glyph is `◎`;
>   - the trace style is `run`;
>   - the what-if finds a reader executor among the stage's.
> - **Tests:**
>   - `workflow/src/reader.test.ts`: a reader at confidence 1 is its rule under `withoutReaders`; the gate sends exactly the items under the threshold to `else`; the steer routes independently of confidence; `null` is below every threshold; the error cases; the re-run from a later stage.
>   - `checkReader`'s fixtures per question type and a red reader per check.
>   - The rule adapter's wrap, and the formula's cases in `core`.
>
> **Diverged:**
> - `withoutReaders` takes the stage ids the readers were fitted to. The rule run has no reader to find them by, and the projection must mask the same stages on both sides.
> - The projection also drops ids and times, which the one extra event shifts (§6).
> - The campaign cell's stage summary (`evals`) admits `reader` as an executor.
> - The hosted and LLM readers get no `ReaderContext` from the runtime yet: a rule needs none, and WP120 passes the session's egress-guarded `fetch` when it builds them.

> **WP117 stage C done 2026-09-30. WP117 is done.** Four rule readers are on their desks' manifests, each shown only what its rule reads:
> - `fs-servicing/reader/category` (`classificationOf` over the caller's words) and `fs-servicing/reader/support-need` (`needIn`), in `fs-servicing/src/readers.ts`;
> - `fs-disputes/reader/classification` (`classificationOf` over the claim's channel, maker and payee, never its amount), in `fs-disputes/src/readers.ts`;
> - `fs-advice/reader/root-cause` (`rootCauseOf` over the logged category), in `fs-advice/src/complaints/readers.ts`.
>
> Each desk also exports its reader executors and a `*_RULE_READERS` overlay, keyed by the stage each replaces.
>
> **The identity** holds in each desk's `readers.test.ts`. Every item of the desk's book was run under each shipped configuration that takes the stage by rule, and again with the rule reader fitted plain and gated at threshold 1:
> - servicing: 40 items × `rules-only`, `bot-identifies-only`;
> - disputes: the whole book × `rules-only`, `bot-verifies-only`;
> - complaints: the whole book × `rules-only`, `bot-acknowledges-only`.
>
> In every comparison, `withoutReaders` projects the two runs equal, byte for byte. The agent traces are equal, bar the workflow's own stamps on its `stage.*` events. Every reader stage reads confidence 1 and never gates, even at threshold 1, and the unprojected runs differ.
>
> `checkReader` passes each reader over the book's own subjects, with the rule's answer expected.
>
> **The DoD, item by item:**
> - **Identity:** met as §6 states it. The golden runs and campaign baselines are byte-identical because nothing they run has changed, and the reader runs are identical under the projection. Full byte identity with a reader fitted is not claimed, since the record says a reader answered.
> - **Never gates:** met.
> - **`checkReader` fixtures per question type:** met, in `pack-testkit`'s own test.
> - **The Pipeline's stage card:** met (`describeReader`).
> - **`reader.schema.json`:** generated.
>
> **Not built:**
> - The fraud desk has no rule reader, because it has no classify-shaped rule (§7).
> - No shipped configuration names a reader. The configurations' records, and so every stored run and report, stay as they were. A configuration that reads by `regex`, `jev` or `llm` is WP120's servicing journey.


> **The Worker's budget +20 kB (2026-09-30).** The full build found the Worker 16 kB over its budget of 1,160,000 bytes, and the budget is now 1,180,000 (`scripts/bundle-budget.mjs`). Three WPs added to the Worker bundle:
> - WP115: the fallible tier and the reviewer model, in `evals` and `workflow`;
> - WP116: the analysis's tiers;
> - WP117: the reader contract, in `core`, `workflow` and `governance`, and the desks' rule readers.
>
> WP115 and WP116 ran the Workbench's type check and tests but not its build, so how the 16 kB splits between the three was not measured. That leaves 3 kB of headroom. The next WP to add to the Worker will need a reading of the budget, not just another increase. For Andrew's reading.

> **WP120 stage B done 2026-09-30.**
> - **The provider seams** in `core`: `ChatRequest.choice`/`topLogprobs`, `ChatResponse.logprobs` and `LLMProvider.supports`. The mock honours them, and `promptDigest` covers the two request fields only when present.
> - **`ReaderContext`** gains `callLine` and `provider`.
> - **In `governance`:** `hostedReader`, `llmReader` with `foldFirstToken`, and `readerComponent`.
> - **The runtime:** `callLine` (shared with the line stage) and `readerProvider`. `touchesOf` counts a gated review once.
> - **`checkReader`** takes the host's context. It passes a rule, a hosted and an LLM reader, and `checkComponent` passes the reader guard (`pack-testkit/src/checks/reader-kinds.test.ts`).
>
> **WP120 stage C done 2026-09-30. WP120 is done.**
> - **`@craftabot/pack-readers-llm`** ships the keyword stand-in `readers-llm/reader/mock` and `llmReaderForCartridge`.
> - **`@craftabot/pack-typesafe`** is on the contract. Each judgment is a reader stage (the regex, Jev, the Spark 122B or 35B, or the stand-in, with the gate's person as `else` and the steer noul on a q2 gate) and a commit. Its readers are content (`TYPESAFE_READERS`) and its executors name their question sets. `llm-mock` and `llm-mock-gate-0.80` join the configurations.
> - **`@craftabot/pack-dgx-spark`** is out of the harness's defaults (G90). It is opt-in by its own `craftabot.config.mjs`, which the typesafe config includes. Its classifier folds through `foldFirstToken`.
> - **The build:** it fails if any of the three optional packs' manifests is in a bundle (`scripts/bundle-budget.mjs`), so every edition is checked.
>
> **The identity through the collapse.** The three Jev experiments were run before and after, with the same corpus book and the same cassettes. Every effect is the same: values, n, intervals and p, 18 + 18 + 24. The result digests moved with the stage ids and were re-pinned (`experiment-identity.test.ts`).
>
> **Diverged:**
> - **The runtime keeps a reader's stated confidence** (rounded to six places) instead of recomputing it from the rounded probabilities. Jev computes its confidence before rounding its probabilities to two places, and recomputing moved one v1 row from 0.90 to 0.8875, across the 0.90 gate. `checkReader` holds a stated confidence to the formula within the probabilities' own precision (n/(n−1) × half their last decimal step). §3.2's "recomputed" no longer holds.
> - **The eighth reference experiment now meets the held-out rule.** Its readers name their question sets, and corpus v3 has seen Jev under q1 and q2, so the run is refused unless `experiments/servicing-readers.json` says `regression: true`, which it now does: it replays recorded answers. Its effects are unchanged, 24 of 24.
>
> **DoD:**
> - The servicing journey runs `regex`, `jev`, `llm-mock` and `jev-gate-0.80` through one executor ✓.
> - The gate sends exactly the rows under the threshold to `else` ✓ (workflow and typesafe tests).
> - The steer routes independently of confidence ✓.
> - The `llm` reader runs over the mock provider constrained and unconstrained ✓.
> - `checkReader` and `checkComponent` are green on all three kinds ✓.
> - The optional packs are absent from every edition's bundle ✓ (the build's check).
>
> **Not built:**
> - OpenAI's and the other shipped providers' constrained and log-probability paths wait on the live checkpoints (WP125).
> - The hosted reader as a guard has no `callLine` at a loop point: only rule and LLM readers guard until the benchmark (WP122) needs it.
> - The calibration pane's screenshot still has no shipped reader configuration in the Workbench (WP118's shortfall stands).

> **Amended 2026-10-01 (WP138, `110-CONTROL-SUITE-PLAN.md` §10):** the shipped configurations now fit the desks' rule readers behind a gate wherever those stages were rules. These are servicing's `classify` and `record`, disputes' `classify` and complaints' `root-cause`, in the rules-only and Level 2 configurations. The line is `fs-bank`'s `DESK_READER_LINE` (0.8, stated) and the `else` is the bank's own rule (`*_GATED_READERS`). Outcomes are unchanged, since a rule reader is sure every time; a less certain reader swapped in at the same id hands what it is unsure of to the rule.
