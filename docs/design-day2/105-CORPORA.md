# 105 — Corpora: labelled rows as content, the held-out rule, the corpus book, a corpus per desk (WP119, WP121)

> **Status:** Phase AE's second design of record, opened 2026-09-30 (`101-DAY7-ROADMAP.md` Phase AE; `100-TARGET-DESIGN-V7.md` §6.4, decision D17, tenet 36; G76 part, G90 part). Stage A of WP119: the schema, the six refusals, the exact semantics of the held-out rule, and the annotator record. Stages B and C are recorded in §8 as they land. Awaiting Andrew's review; the build continues.

## 1. Where the code is (WP119)

- **`packages/core/src/schemas/corpus.ts`**:
  - the schemas: `corpusSchema`, `corpusRowSchema`, `annotatorSchema`, `secondLabelsSchema`;
  - the functions: `corpusDigest`, `seenByFor`, `heldOutRefusal`;
  - `docs/schemas/corpus.schema.json`.
- **Core registration**:
  - `PackManifest.corpora`, and the registry's `getCorpus`/`listCorpora`;
  - the `corpus` content kind and the `corpus` evidence kind;
  - `BookRequest.corpus`, `Book.source.corpus`, and `ReaderExecutor.questionSet`.
- **`packages/metrics/src/agreement.ts`**: `cohensKappa`.
- **`packages/pack-testkit/src/checks/corpus.ts`**: `checkCorpus`.
- **`packages/evals`**:
  - the book source's `corpus` and `regression`;
  - the held-out rule in `prepareCampaign`;
  - `CampaignCell.regression`.
- **`packages/harness/src/commands/corpus.ts`**: `craftabot corpus freeze | label | agreement`.
- **`apps/workbench/src/routes/workshop/corpora/`**: the list and the corpus page, whose tables are their own twin.
- **`packages/packs/fs-servicing/corpora/`**: the three servicing corpora as JSON, with their second-label files.
- **The typesafe pack's arrays**: now read from these corpora.

## 2. Principles

1. **A corpus is content, frozen, labelled by someone other than its author, and never scored on data it has seen** (tenet 36).
2. **The freeze is a digest, not a promise.** A corpus's digest is SHA-256 over the canonical JSON of its label sets and rows. A corpus whose rows no longer hash to it is refused.
3. **The held-out rule is a refusal in the runner, not a convention** (`100-…` §10). A campaign that scores a reader on a corpus that reader has already been scored on, with the same questions, does not run unless it says it is a regression.
4. **The labelling tool never shows a label.** A second annotator sees the guide, the options and the row's state, and nothing that depends on the primary's labels.
5. **Nothing real** (hard rule 9). Every row passes `checkSynthetic`. The guide says in words that the rows are synthetic English written by the product's authors, and that a real-call sample labelled by someone else is the missing test.

## 3. The schema (`core/schemas/corpus.ts`)

```ts
interface Corpus {
  id: string;                        // qualified: 'fs-servicing/corpus/requests-v1'
  name: string; version: string;
  stateKind: string;                 // what a row's state is: 'caller-words'
  guide: string;                     // the labelling guide, the authorship and the missing test
  labels: Record<string, { options: string[]; guide: string }>;
  rows: CorpusRow[];
  questions?: { id: string; digest: string };        // the set the corpus was written against
  annotators: Annotator[];                            // the primary first
  heldOut: boolean;                                   // written after `questions` was frozen
  seenBy: { readerId: string; questions: string; on: string }[];
  digest: string;
}
interface CorpusRow {
  id: string; state: Json; tags: string[];
  labels: Record<string, string>;
  contested?: { reason: string; alternatives: Record<string, string> };
}
interface Annotator { id: string; blind: boolean; primary?: true; kappa?: Record<string, number>; note?: string }
```

**Diverged from `100-…` §6.4:**
- The corpus carries a top-level `guide`: the authorship statement and the missing test, which belong to the corpus as a whole. Each label's `guide` stays with the label.
- `Annotator.primary` marks the author's labels.
- **The digest's scope.** The digest covers `labels` and `rows` only. The annotators, `seenBy` and `digest` are its history and are not frozen: `seenBy` is appended, and an annotator's κ is added after blind labelling, both without a re-freeze.
- **`questions.id` is what `seenBy.questions` names.** `questions.digest` pins that set's text.

**A second-label file** (`secondLabelsSchema`) is what `corpus label` writes. It holds:
- `{ corpusId, corpusDigest, annotator, blind: true, labels: [{ id, labels, note? }] }`;
- `note`: the annotator's own words where they were unsure.

## 4. `checkCorpus`: six refusals and a finding

| Check | Refuses |
|---|---|
| `corpus.well-formed` | the schema; a duplicate row id; a label set with fewer than two options; a contested row's alternative outside its label's set |
| `corpus.digest` | a digest that is not the rows' and labels' |
| `corpus.synthetic` | a row whose state `checkSynthetic` flags |
| `corpus.labels` | a row missing a label, or with a value outside its set |
| `corpus.held-out` | a held-out corpus that names no question set, or whose `seenBy` names that set from before the corpus was frozen — see §5 for what "before" means |
| `corpus.annotators` | no primary; a κ on a label the corpus does not have, or outside [−1, 1]; a κ on a non-blind annotator |
| *`corpus.single-annotator`* | **a finding, not a refusal:** no blind annotator. The pack's page shows it, and `checkCorpus` returns it with `severity: 'warning'`. |

## 5. The held-out rule, exactly

A **reader executor names its question set**: `ReaderExecutor.questionSet?: string`, an id like `typesafe/questions/servicing-q1`. `corpus.seenBy` records `(readerId, questions, on)`, where `questions` is that id.

**The rule, in `prepareCampaign`.** A book campaign whose source names a corpus (`source.corpus`) checks, for every build, the reader executors its configuration fits at any stage. A reader executor is **refused** when either of these holds:
- **(a)** it names no `questionSet`: a reader scored on a corpus must say which questions it asked;
- **(b)** `corpus.seenBy` contains its `(readerId, questionSet)`, unless the source is marked `regression: true`.

A refused campaign throws before any cell runs, and names the reader, the question set and the corpus. A regression campaign runs, and every cell carries `regression: true`, so a report and an experiment show which numbers were measured on seen data.

**What a held-out corpus adds.** `heldOut: true` means the rows were written after `questions` was frozen, and the check refuses a held-out corpus that names no question set. The rule in the runner is the same for every corpus. A held-out corpus is simply one whose `seenBy` was empty when its first recording was made. `seenBy` is never rewritten: the harness appends to it when a recording is made (`corpus seen`, WP120's recorder), and the branch's history is written in by hand, once, at migration (§7).

**Not built:** reading `seenBy` from a campaign's own report after the fact. The rule acts before a run, never after.

## 6. The labelling tools (`craftabot corpus …`)

- **`freeze <corpus.json>`**: writes `digest` over `labels` and `rows`, and prints it. It refuses a corpus that fails `checkCorpus`, except on the digest.
- **`label <corpus.json> --as <annotator> [--out <file>]`**: walks the rows on the terminal in the corpus's order.
  - For each row it shows the corpus guide once, each label's guide and options, then the row's id, tags and state, and asks for one option per label. Input is by number or by name, with `?` for a note.
  - It writes a second-label file. It never prints a row's labels, its `contested`, or anything computed from them.
  - The test runs it over a corpus in which two rows share a state but differ in their labels, and asserts the two rows' printed blocks are identical.
- **`agreement <corpus.json> <labels.json>`**: computes Cohen's κ per label between the primary and the file (`cohensKappa`, `@craftabot/metrics`), and prints the disagreements by row. It records the annotator on the corpus with `blind` and `kappa`, replacing an earlier record of the same annotator. It refuses a file whose `corpusDigest` is not the corpus's.

## 7. The corpus book, and the servicing corpora

**The book.**
- `BookRequest.corpus?: Corpus`: when a campaign's book source names a corpus, `evals` resolves it from the registry and hands it to the workflow's `book`. The pack turns each row into a work item with the row's labels as its truth.
- `Book.source.corpus?: { id, digest }` records which corpus, frozen at which digest, the book came from.
- `evals` refuses a book whose `source.corpus.digest` is not the registered corpus's.

**The servicing corpora** move into `fs-servicing` as `corpora/requests-v1.corpus.json` (95 rows), `requests-v2.corpus.json` (115) and `requests-v3.corpus.json` (96). Each has:
- the guide in words;
- each row's state (the caller's words), its difficulty tag, and its category and need, plus a steer label on v3 from its `steer` tag;
- `contested` with the second labeller's alternatives;
- the annotators and their κ, computed by `corpus agreement` from the branch's second-label files;
- `seenBy` as the lab record (`98-…` §9–§12) says who read which corpus with which questions.

v3 is `heldOut` against q2.

`@craftabot/pack-typesafe`'s `SERVICING_CORPUS{,_V2,_V3}` become views of these corpora in their old shape. A test holds the views to the branch's freeze hashes (`46379f9f…`, `c4ee02de…`, `3c90c8a3…`), so the move lost nothing. Its `corpusBook` becomes the corpus book. `experiment-identity.test.ts`, written before the move, pins each Jev experiment's result digest under a fixed clock, and holds them through it.

**The result the branch committed is not today's.** Re-running `servicing-jev` today gives the committed effects on the request, the need and the needs met, but not on `disclosure-recorded` or the gated `touches`. WP111 changed the servicing desk: the need is recorded before the act, and a review is counted once. So "byte for byte to the branch's experiment result" is read as the result that today's code produced before the move, which is what the pins hold. The committed results are regenerated under `docs/evidence/servicing-readers/` (§8).

**The eighth reference experiment.** `experiments/servicing-readers.json` is the held-out design: v3, q1 against q2, regex against Jev with and without the gate. Its full-size result goes under `docs/evidence/servicing-readers/`, and CI's reduced run and shape check cover it through the typesafe pack's `--config`. The lab record (`packages/packs/typesafe/experiment/README.md` and its analysis files) stays beside the scripts that write it. The evidence folder's README points at it.

## 9. A corpus per desk (WP121)

### 9.1 The six questions, frozen first

Each desk has one judgment over words: a typed question, a keyword rule reader answering it at confidence 1, and a question set id with its digest. All six were committed before any corpus row was written, so every corpus here is **held out** from its question set (§5).

| Desk | The words | Question set | Label | Options | Rule reader |
|---|---|---|---|---|---|
| Disputes | the customer's account of a disputed payment | `fs-disputes/questions/claim-q1` | `classification` | unauthorised · authorised-scam · merchant | `fs-disputes/reader/claim-words` |
| Fraud | the customer on a call about a held payment | `fs-fraud/questions/coaching-q1` | `coached` | yes · no | `fs-fraud/reader/coaching-words` |
| Complaints | a customer's complaint | `fs-advice/questions/complaint-q1` | `cause` | charges · advice · service · no-error | `fs-advice/reader/complaint-words` |
| Onboarding | an applicant on what the account is for | `fs-onboarding/questions/purpose-q1` | `purpose` | everyday · salary · savings · business · third-party-funds | `fs-onboarding/reader/purpose-words` |
| Lending | an applicant on what the loan is for | `fs-lending/questions/loan-purpose-q1` | `purpose` | car · home-improvement · debt-consolidation · holiday · other | `fs-lending/reader/loan-purpose-words` |
| Advice | a customer on what they want their money to do | `fs-advice/questions/goal-q1` | `goal` | grow · income · keep-safe · purchase (the desk's own `Goal`) | `fs-advice/reader/goal-words` |

Each rule reader is what a bank writes first, a keyword list: the first pattern the words match, else a default. It is the baseline the other readers are read against, and the corpus says how good it is.

**Why the words, and not the existing rules.**
- The disputes desk's classification rule reads the claim's recorded figures (§7 of `104-…`), and the complaints desk's root-cause rule reads the logged category. Neither reads a customer's words, which is where a reader earns its place.
- The words readers sit beside those rules, which are unchanged.
- The fraud, onboarding, lending and advice desks had no rule over words at all (`104-…` §7). These are their first.

### 9.2 Authoring and the blind second label

- **The author.** Each corpus is written by an authoring pass: a subagent briefed with the guide, the options, the keyword rule and the difficulty tags. It writes about a hundred rows, with a spread over the options and a share of *traps* (the rule's words used in a sense it does not mean) and paraphrases that avoid them. It marks a row `contested` where a careful labeller could go the other way.
- **The second annotator.** Each corpus is then labelled blind by a second subagent. It sees the guide, the options and the rows' words, and nothing else: no labels, no tags, no rule, no repository. The v1 servicing corpus gets its missing second labeller the same way, so no corpus carries the single-annotator finding. κ is computed by `corpus agreement` and recorded on the corpus. Each disagreement is read. A disagreement on a row not marked contested is reported, never relabelled to agree.
- **The rules every row obeys.** English, synthetic, no digits, and no real person, place, company or product. The sweep holds them. Each guide says who wrote the rows, that they are synthetic, and that a sample of real words labelled by someone other than the product's authors is the missing test.

### 9.3 Scoring

`scoreReader(reader, corpus, question, label)` (`evals`) asks a reader each row's words and reports:
- its accuracy against the primary label, with a Wilson interval;
- its accuracy against either labeller;
- the per-option confusion.

The desk's rule reader and the keyword stand-in (`readers-llm/reader/mock`, §10 of `104-…`) are scored on each corpus. The numbers go into the desk's own note, and each desk's corpus test holds them.

**Diverged from `101-…` WP121.**
- **No journey configurations.** The roadmap asked for "a `regex` vs `llm:mock` configuration" on each desk's classify-shaped stage. Four of the six desks have no stage that reads words. On the two that do, a new configuration would change the journeys page and the Monitor's default, as WP118 found. So the comparison is made on the corpus with `scoreReader`, not through the journeys. The servicing journey's comparison stays WP120's.
- **Held out whole.** Each corpus is held out from its question set as a whole, with no seen part. The question sets were written from the guide, not from any row, and none has been tuned. A seen split needs a second question set, which the first live recording (WP125) will bring.

## 8. Stage notes

> **WP119 stage B done 2026-09-30.**
> - **In `core`:**
>   - the corpus schema, `corpusDigest`, `seenByFor`, `heldOutRefusal` and `secondLabelsSchema`, generated as `corpus.schema.json`;
>   - `PackManifest.corpora` and the registry's `getCorpus`/`listCorpora`;
>   - the `corpus` content and evidence kinds;
>   - `Book.source.corpus`, `BookRequest.corpus` and `ReaderExecutor.questionSet`.
> - **`cohensKappa`:** in `metrics`, with its hand case, planted case and null under a fifth family, *agreement*.
> - **`checkCorpus` and `corpusFindings`:** in `pack-testkit`, with a red corpus per refusal.
> - **`evals`:** `source.corpus` and `source.regression`, the held-out rule in `prepareCampaign`, the book held to the corpus it claims, and `CampaignCell.regression`.
> - **`craftabot corpus freeze | label | agreement`:** the label walk is tested on two rows with one text and two sets of labels, which print alike.
> - **The Workbench:**
>   - `/workshop/playground/corpora` with its fold (`lib/workshop/corpora.ts`), linked from the Playground page;
>   - a pulled corpus imported as local content.
> - **Supabase:** the `evidence_corpora` table.
>
> **Diverged:**
> - The page is `/workshop/playground/corpora`, under the Playground's rail entry, not a rail entry of its own at `/workshop/corpora`. A new rail entry would redraw the rail on every Workshop screenshot.
> - `freeze` parses the corpus but does not run `checkCorpus`: the CLI does not load a test kit. The pack's own test holds the rest.
> - The single-annotator finding is its own function, `corpusFindings`, because the kit's issues carry no severity.

> **WP119 stage C done 2026-09-30. WP119 is done.**
>
> **The corpora.** The three servicing corpora are content in `fs-servicing` (`src/corpora/requests-v{1,2,3}.corpus.json`, on the manifest as `SERVICING_CORPORA`):
> - they are written from the branch's arrays by a one-off migration, with the guides in words;
> - v3's steer is a label, drawn from its `steer` tag;
> - `contested` carries the second labeller's alternatives;
> - `seenBy` records Jev, the Spark 122B and the Spark 35B under q1 and q2, as the lab record says.
>
> The second-label files ship beside them in the `corpus label` format. `corpus agreement` over them gives the recorded κ: v2 1.00 / 0.92, v3 0.99 / 1.00 / 1.00 (`harness/src/corpora.test.ts`). Every disagreement falls on a row the author had marked contested. v1 carries the single-annotator finding, and v3 is held out from q2.
>
> **Nothing lost.** The typesafe pack's `SERVICING_CORPUS{,_V2,_V3}` are now views (`legacyRows`). They hash to the branch's freeze hashes (`corpus-migration.test.ts`). `corpusBook` takes a `Corpus` and stamps `Book.source.corpus`. The three Jev experiments run to the result digests pinned before the move (`experiment-identity.test.ts`), byte for byte.
>
> **The eighth reference experiment.**
> - `experiments/servicing-readers.json` is v3's design, naming its corpus. Its full-size result is under `docs/evidence/servicing-readers/`, with a README.
> - CI's reduced loop passes the typesafe pack's `--config` for all eight, and the reduced run holds the shape.
> - The loop found two harness bugs, both fixed:
>   - `experiment run --jobs` never handed its workers `--config` (`ExperimentRunOptions.configPath`);
>   - a pool whose workers could not start rejected without ending them, so the process waited for ever (`cell-pool.test.ts`).
>
> **The harness's own test of the designs** (`reference-experiments.test.ts`) now loads the typesafe pack's config, as CI's loop does. The eighth design names no control, since it measures readers, not a control. `turbo.json` makes the harness's tests wait for the typesafe pack's build, which is not otherwise a dependency of the harness.
>
> **The sweep.** `checkSynthetic` now walks `corpora` directories too (it matched only `corpus`), and asserts the servicing corpora are among its files.
>
> **Budgets.** The main bundle is +70 kB (2,370,000) and the Worker +70 kB (1,260,000): the 306 rows ship in fs-servicing's desk chunk and ride into the Worker. For Andrew's reading.
>
> **DoD:**
> - `checkCorpus`'s six refusals ✓.
> - The held-out rule refuses a re-score and admits a regression ✓ (`evals/src/corpus-source.test.ts`).
> - `corpus label` never shows a label ✓.
> - A corpus book runs the servicing journey to the experiment result byte for byte ✓. This holds against the result today's code gave before the move, not the branch's committed file, which WP111 already moved (§7).
> - The eighth experiment holds its shape ✓.
>
> **Not done:**
> - The lab record stays in the typesafe pack beside its scripts, and the evidence folder's README points at it.
> - No reader executor names a `questionSet` yet: the servicing journey's readers are still `line` executors until WP120, so the held-out rule has nothing to refuse on the shipped designs.
> - The Supabase table's live checkpoint is not taken.
