# 104 — Readers: typed questions, the `reader` executor, the rule readers (WP117, WP118)

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

Everything else is held: every stage's input and output digests, every act, every approval, every item's outcome, every agent run's trace, the ledger and the handoffs. A second assertion shows the projection hides no more than that: the two runs differ, and they differ only in those fields.

## 7. Stage C: which rules, and which not

The classify-shaped rules `100-…` §6.3 names, as found:

| Desk | Stage | Rule | Reader | Question |
|---|---|---|---|---|
| Servicing | `classify` | `classificationOf(subject)` | `fs-servicing/reader/category` | `category`, choice over the five categories |
| Servicing | `record` | `needIn(subject)` | `fs-servicing/reader/support-need` | `need`, choice over the four needs |
| Disputes | `classify` | `classificationOf(claim figures)` | `fs-disputes/reader/classification` | `classification`, choice over the three |
| Complaints | `root-cause` | `rootCauseOf(category)` | `fs-advice/reader/root-cause` | `cause`, choice over the root causes |

**The fraud desk's coaching markers are not a rule.** Whether a caller is being coached is a truth fact (`facts.coached`) read only by an evaluator, and no stage of the fraud journey classifies the call. There is nothing to wrap. A reader that tries to answer *is this caller coached?* from the call's words is a reader with no rule baseline, and it belongs to WP121's fraud corpus. The remaining desks (lending, onboarding, collections) decide by rules over figures (affordability, screening, disposable income), not by reading words, and `100-…` does not name them.

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
