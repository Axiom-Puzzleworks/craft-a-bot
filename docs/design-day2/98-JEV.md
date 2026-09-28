# 98 — Jev (TypeSafe AI): capabilities, API, and where it fits in Craft A Bot

> **Status (2026-09-28):** research note, outside any work package. Written from TypeSafe's public documentation (`docs.typesafe.ai`, read 2026-09-28, pages for `jev-1.13`) plus two probes of the live API without a key. Nothing here was verified with an authenticated call — the numbers quoted are TypeSafe's, not ours. §7 proposes a one-day project.
>
> **Amended 2026-09-28, later:** the project was built on the `jev-servicing` branch, as an optional pack (§8), with a live recording taken. §9 has the results. With a key, the latency and price figures in §1 are now partly ours: 205–543 ms per call over 190 calls. The unauthenticated 403 in §3 stands.

## 1. What Jev is

Jev is TypeSafe AI's hosted model, sold as the first **"System One" model**: fast, narrow, typed judgments for software, as opposed to a generative LLM's slow, open-ended "System Two" reasoning. You send it a **state** (text or JSON) and a map of **typed questions**; it returns one **typed answer per question** with a probability distribution. It does not generate text, call tools or hold a conversation.

| Property | Value (`jev-1.13.0`) |
|---|---|
| Output | Only the types you declared — a choice from your options, a score on your levels, or a yes/no probability. No free text, so no malformed output and nothing to parse. |
| Training | RLCD, "Reinforcement Learning for Calibrated Decisions": it optimises for honest probabilities, not for preferred text. The same weights serve every customer. No fine-tuning; you customise it through the request. |
| Latency | 70–500 ms end to end, as claimed. All questions in a request are scored in parallel against one read of the state. |
| Price | $0.042 per million **input** tokens ($42/Btok). Output is free. A 1,000-token request costs about $0.00004. |
| Context | 64k tokens per request (state plus all questions); 32k for the state plus the longest question. |
| Input | Text only: a string, a JSON object or an array. No images, audio or video yet. Works best in English. |
| Rate limits | 250k tokens/s and 1,200 requests/min. The docs say these "adjust dynamically" while demand is high. |
| Data | Customer data is not used for training. Zero data retention is available on enterprise plans. |

## 2. The three question types ("primitives")

Every question has `type` and `instructions`. Each type adds its own `criteria`. You can mix the three types in one request, and each is answered independently of the others.

| Type | Asks | `criteria` | Answer fields |
|---|---|---|---|
| **`noul`** | A yes/no question | Optional `{ true, false }`, saying what yes and no mean | `noul`: P(yes) in 0–1. There is **no** `confidence`, because the value is the whole distribution. |
| **`choice`** | Pick one option | A map of option key to description (or `null`), **max 255** | `choice` (the most likely key), `probabilities` (one per option, summing to 1), `confidence` 0–1 |
| **`score`** | Place on an ordered rubric | An ordered array of level descriptions, **2–10 levels** | `score` (a probability-weighted index that can fall between levels), `legend`, `probabilities` per level, `confidence` 0–1 |

`instructions` and `criteria` can be strings, objects or arrays. To check a record against the state, put the record in a field of `instructions` and name it in backticks — for example `"Is the resume for the same person as `potential_duplicate`?"`. Questions can also point into the state the same way, e.g. `` `items[3]` ``.

**Confidence** summarises the answer's distribution into one number (for a Choice, it is roughly `(n·p_max − 1)/(n − 1)`). TypeSafe's recommended pattern uses three bands — act, confirm or review, hand to a human — with **thresholds set by how costly a mistake would be**, and the thresholds live in your code. Pin a versioned ID (`jev-1.13.0`) if you have tuned thresholds against it, because `jev-latest` moves when a new version ships.

## 3. The API

```http
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <TYPESAFE_API_KEY>
Content-Type: application/json

{ "model": "jev-latest", "state": <string|object|array>, "questions": { "<id>": Question, … } }
→ 200 { "model": "jev-1.13.0", "answers": { "<id>": Answer, … }, "usage": { "input_tokens", "output_tokens" } }
```

- `GET /v1/models` lists the aliases (`jev-latest` and `jev-preview`, both currently `jev-1.13.0`).
- Errors: 401 (bad or missing key), 422 (validation, with the body naming the field), 429 (rate limit; honour `retry-after`), 529 (overloaded). **Observed 2026-09-28:** a request with no key returns **403** with `{"detail":{"error_type":"authentication_error",…}}`, not the 401 the reference lists.
- The API has no batch or streaming endpoint. You batch by packing many questions into one request ("speculative fan-out"). TypeSafe's GDPR cookbook reports 13 questions in one call as 12× cheaper and 10× faster than 13 separate calls, with the same answers.
- **SDKs:** Python `typesafe_sdk` (sync and async clients) and JS/TS `@typesafe-ai/sdk` v0.6 (Node ≥ 20). The JS client is `new TypeSafeClient({ apiKey?, baseURL?, defaultModel?, timeout = 10_000, retry?, fetch? })`, and `client.systemOne({ state, questions })` infers the answer types from the questions. There are helpers `noul()`, `choice()` and `score()`. The client takes an **injectable `fetch`**, which fits our session's egress-guarded fetch. It refuses to run in a browser unless you pass `dangerouslyAllowBrowser`.
- **CORS (probed 2026-09-28):** the preflight returns `access-control-allow-origin` only for `https://console.typesafe.ai`. From `http://localhost:5173` or `https://axiom-verity.com` it returns 400 with no allow-origin header. **So the Workshop cannot call Jev directly from the browser: Jev is harness-only**, like `bedrock-guardrails` and `lakera-guard` (WP99, `browserRefusal`). This is also how we want it anyway (hard rule 2).
- Tooling: there is a Playground at `console.typesafe.ai/playground` (share links hold the state and the questions), an agent skill (`claude plugin install typesafe@typesafe-ai`), and integrations in LiteLLM, Pydantic AI and LangChain.

## 4. Where it is weak — `jev-1.13`'s "jaggedness" (TypeSafe's own list)

| # | Failure mode | What it means for us |
|---|---|---|
| 1 | Literal reading | It answers the question as written, so put the boundary cases in `criteria`. |
| 2 | Maths, counting, numeric precision | Don't ask it about amounts, limits, affordability or ratios. That arithmetic stays in the rule, in truth. |
| 3 | Comparing dates and times | Don't ask "is this inside the 13-month window?" (PSR, DISP timescales). Extract the parts and compare in code. |
| 4 | Indirection | One judgment per question. Point at the state field by name. |
| 5 | A large state full of irrelevant detail | Send the one field that matters, e.g. the utterance or the merchant's note, not the whole case file. |
| 6 | **Adversarial content can move the answer** | State is not treated as hostile. **An injected merchant's note or a jailbreak can steer it.** This is something to measure, not to assume. |
| 7 | Instructions that contradict the criteria | Keep them aligned. |
| 8 | No structural invariants | P(noul) ≠ 1 − P(not noul), and a Noul threshold does not carry over to a Choice. Ask each decision one way only. |
| 9 | Generating text | It can't. Use it to pick from candidates, not to write. |

In one line: Jev is a **calibrated judge of meaning over short text**. It is not a calculator, a clock or a writer, and it is not hardened against adversarial input.

## 5. The patterns TypeSafe recommends, mapped to our vocabulary

| TypeSafe pattern | Craft A Bot equivalent |
|---|---|
| Guardrails for LLMs: a battery of hazard Nouls plus a severity Score in one request, routed to pass / review / block / support by named policies | A `GuardrailService` on the shell (`29-…`). One request per `pre-model`/`post-model` check. The policies become a **stack's** thresholds (`89-…`). The four routes map onto the verdict (`allow` / `annotate` / `block`) and `human-approval`. |
| Confidence-gated routing (act / confirm / human, with thresholds by stakes) | Tiered actions and the autonomy levels of the five reference configurations (`73-…`). A stage whose executor hands off when confidence is low. |
| Intent routing (to deterministic code, a specialist LLM or a person) | A workflow triage stage choosing `StageNext` or a handoff (`94-…`). |
| Composite scoring (atomic Scores, weights in code) | The rule stays in truth. Jev supplies features, never the decision. |
| Self-consistency: Noul/Choice with an "uncertain" band sent to review | Human load by level (`65-…`). What fraction goes to a person is exactly what the Monitor measures. |
| Citation check / RAG passage classification | `explanation-faithful` (`52-…`): does the stated reason match the evidence? |

## 6. Use cases in a Craft A Bot workflow

Three seams can host Jev with **no `core` change** (hard rule 4):

- **(S) a service line** whose operation calls Jev. A workflow stage runs it through the `line` executor (`packages/workflow/src/run.ts` `lineStage`, with `arguments(stageInput, state)` shaping the state). It gets `simulate`/`cassette`/`live` for free (`47-…`), and `craftabot record` records it under the line's own egress.
- **(G) a `GuardrailService`** on the hosted shell (`packages/core/src/types/guardrail-service.ts`, `createHostedGuardrails`), modelled on `packages/packs/lakera-guard/`: `bearer-token` credential, egress `api.typesafe.ai`, `browserCapable: false`, an offline fixture stand-in, and `checkGuardrailService`. It then becomes a component at every hook plus `stage-in`/`stage-out`, and can sit in stacks, the Studio, campaigns and experiments.
- **(E) a hosted `Evaluator`** (`kind: 'hosted'`, modelled on `geap/eval/*`), reading the transcript and, where allowed, truth.

Jev's **answer sets are closed, and so are ours**. Most bank desks already classify into a fixed enum with a regex or keyword rule, and truth labels the right answer. That is the core of every row below.

| # | Use case | Seam | Where | Truth to score against | Fit with Jev's strengths and weaknesses |
|---|---|---|---|---|---|
| **1** | **Servicing: classify the request and record the support need.** Replace the regex rules `classificationOf` and `needIn` (`fs-servicing/src/world/rules.ts`) with one Jev request: a Choice over `Category` (5 values) and a Choice over `SupportNeed` (4 values), with confidence. | S | `fs-servicing/servicing`, stages `classify` and `record` | facts `category`, `discloses`; evaluators `classified-correctly`, `disclosure-recorded`, `needs-met` | ★★★ Short text, closed sets, semantic judgment, English. The regexes are brittle: "I've been let go", "in and out of hospital" and "my phone died" all trip or miss them. |
| 2 | **Vulnerability detection as a guard:** screen every customer turn for a disclosed support need (FG21/1's four driver groups), `annotate` on detection, route to a person when unsure | G | servicing, collections and advice desks at `post-act`/`stage-out` | facts `discloses` on all three desks; `vulnerability-actioned` (collections) | ★★★ One component, three desks. The Consumer Duty story. |
| 3 | **Disputes: classify the claim** as `unauthorised` / `authorised-scam` / `merchant`, plus `scamPattern` | S | `fs-disputes`, stage `classify` (agent today; rule `classificationOf` at `workflow.ts` L263) | `verdict.classification`, `scamPattern` | ★★ Good fit. **Keep the PSR limit and the 13-month window in code** (jaggedness #2, #3). |
| 4 | **Prompt-injection screen on counterpart text**, e.g. the merchant's note | G | disputes (`MERCHANT_NOTE_INJECTION`), onboarding tipping-off, any desk's `pre-think` | the campaign's injection cases, `hit-contained` | ★★ A good *measurement*: TypeSafe warns that adversarial state can steer Jev (#6). It gives a fifth vendor in the Guard Rack to compare against Lakera, Prompt Guard, Model Armor and Azure. |
| 5 | **Fraud triage:** Nouls for the coaching markers in the call ("told to lie to the bank", "safe account"), plus a Choice over the decision | S or G | `fs-fraud/fraud`, stages `triage`/`decision` | alert `label`, `coached`; `alert-decision` with **confusion semantics** | ★★ The only evaluator with a confusion matrix. The transaction features stay numeric in code. |
| 6 | **Complaints: root cause** as a Choice over categories, and "is this expression of dissatisfaction a complaint?" (DISP 1.1) as a Noul | S | `fs-advice/complaints`, stage `root-cause`; the fraud→complaints handoff | `well_founded`, `category` | ★★ The Noul is DISP's definitional test: semantic, short text. |
| 7 | **Faithfulness judge:** "do the stated reason codes follow from the evidence?" | E | lending (`explanation-faithful`), advice suitability letter | `reasonsUsed` | ★ The citation-check pattern. A cheap second opinion beside `evals/judge/rubric`. |
| 8 | **Conduct screen on the agent's outgoing `say`:** tipping-off, promising outcomes, pressure selling | G | onboarding, collections, advice at `pre-act` | *A hit is never said*, CONC 7 cards | ★★ One request per say, pass/review/block policies as a stack. |
| 9 | **Monitor Judge at scale:** score every run in a book or bank day on a rubric (tone, clarity, Consumer Duty outcomes) | E | Monitor, campaigns | rubric evaluators' labels | ★ The cost per run is almost nothing ($0.04/Mtok), so it can run over every run, not a sample. |
| 10 | **Intent routing at the Front Desk / Kit**, as a teaching demo of calibrated confidence | S | Kit's Front Desk | — | ★ Nice for teaching (purpose 1), but harness-only means no Kit path until there's a proxy. |

**What not to use it for:** affordability, limits, dates, counting, anything already exact in truth, and generating replies.

## 7. Today's project — Jev as the servicing journey's classifier (use case 1, with 2's measurement)

**Question:** does a calibrated classifier beat the bank's regex rules at classifying a servicing request and recording the caller's support need? Does its confidence let the journey hand the uncertain cases to a person, and what does that cost in human load?

**Why this one:** closed sets on both sides, labelled truth and evaluators that already exist, a known weakness in the incumbent rule, and a Consumer Duty outcome (a missed disclosure) that a reviewer cares about. It needs no core change, and it slots into the existing experiment machinery as one new `executors` factor level.

**Plan (about a day):**

1. **Key and smoke (30 min).** Put `CRAFTABOT_CREDENTIAL_TYPESAFE` in `.env`. Add `packages/packs/typesafe/scripts/smoke.ts` modelled on Lakera's: one call, which confirms the key, the model id, latency and the 401-vs-403 behaviour. Add `smoke:typesafe` beside the others, never run in CI.
2. **The corpus (1–2 h).** Build `fs-servicing` fixtures: about 200 synthetic caller utterances (hard rule 9, all authored or generated, no real people). Label each with `category` and `need`, including the hard cases the regex gets wrong (paraphrases, negatives like "my phone died", "passed my test", and needs disclosed in a request about something else). Offline, score the regex against the labels to get the incumbent's baseline.
3. **The pack (2–3 h).** `@craftabot/pack-typesafe`, with a `jev` service line. Operations:
   - `classify-request`: state `{ utterance }`; Choice over `Category`; Choice over `SupportNeed`.
   - `screen-disclosure`: one Noul per need.

   It uses `@typesafe-ai/sdk` with the session's `fetch` injected (egress `api.typesafe.ai`, credential `bearer-token`), or a plain `fetch` if we'd rather not add the dependency. It returns `{ category, need, confidence, probabilities }`. Use `craftabot record` to record a **cassette** over the corpus, so CI replays it with no network. Add `checkServiceLine` in the pack's tests.
4. **The executor level (1 h).** Add a servicing configuration whose `classify` and `record` stages use `{ kind: 'line', lineId: 'jev', operation: 'classify-request', arguments: … }`. Add one variant that hands the item to the `human` executor below a confidence threshold. That is TypeSafe's confidence-gated routing, and our human load by level.
5. **The experiment (1–2 h).** Write `experiments/servicing-classifier.json`: the servicing book as the source, `executors` as the factor (rule vs jev vs jev+human-below-τ), and metrics `classified-correctly`, `disclosure-recorded`, `needs-met` and human load. Run it on the cassette, then do one live run. Record the result under `docs/evidence/`; it lands in the Control Effectiveness Register (`80-…`).
6. **Write-up.** Add a dated result note to this document: accuracy and calibration per class, the confusion between classes, a reliability plot from the corpus, the human-load curve over τ, cost and latency per case, and what failed.

**Open points to settle before step 3:**

- Does a book-driven servicing run carry the caller's mid-call words anywhere a `line` stage can read them, or only `request.subject`? If only the subject, the `disclosure-mid-call` case needs the transcript (agent stage) or a stage-out guard (use case 2) to be fair to either side.
- `ScreenFinding.category` has no neutral "classification" value. That only matters if we take use case 2 as a guard today.
- Where the pack lives: a new `packages/packs/typesafe` on a `jev-servicing` branch, per the one-WP-per-branch rule.
- The line is **harness-only**, because CORS admits only TypeSafe's console. The Workshop shows it as a stand-in with a *not in the browser* note, as for Bedrock and Lakera.

**Risks:** rate limits "adjust dynamically", so the recorded cassette is the insurance. `jev-latest` moves, so pin `jev-1.13.0` for the experiment. Our corpus is authored by us, so the result says how Jev does on *our* synthetic language, not on real calls. Say so in the write-up.

## 8. What was built (2026-09-28, branch `jev-servicing`)

**Optional by construction.** Everything Jev-specific is in `@craftabot/pack-typesafe` (`packages/packs/typesafe/`). The pack is not in the harness's default list (`packages/harness/src/config.ts`), the Workshop's packs or any edition. You install it per command with the config file beside it:

```bash
npm run craftabot -- experiment run --config packages/packs/typesafe/craftabot.config.mjs --file packages/packs/typesafe/experiment/servicing-jev.json --egress none --out packages/packs/typesafe/experiment/out
```

Without `--config`, Craft A Bot runs exactly as before. The bank's own journeys don't know the pack exists.

| Part | File | What it is |
|---|---|---|
| The Jev line | `src/jev/line.ts`, `src/jev/types.ts` | `typesafe/jev`, operation `system-one`: state plus typed questions in, Jev's typed answers out as the result's `data`. Egress `api.typesafe.ai` (`observation`, `credential-header`). Credential `typesafe` (`CRAFTABOT_CREDENTIAL_TYPESAFE`, `bearer-token`). `browserCapable: false`. Backoff on 429/529. Plain `fetch`, so there's no SDK dependency. Reusable by any desk: the questions travel in the arguments. |
| The cassette | `src/cassettes/typesafe-jev.craftabot-cassette.json` | 190 live answers, recorded by `craftabot record` under the egress guard (0 refused). Every run replays it by argument digest; a call it has not seen is a loud `cassette-miss` and is never sent. CI never needs the key. |
| The corpus | `src/servicing/corpus.ts` | 95 authored, synthetic caller utterances (24 address, 20 card, 16 third-party, 15 bereavement, 20 disclosure; 46 disclose a need). Each is labelled with a request and a need and tagged `plain` / `paraphrase` / `trap` / `mixed`. |
| The questions (v1) | `src/servicing/questions.ts` | One Choice for the request (5 options) and one for the need (4), with the state being the caller's words alone. Pinned to `jev-1.13.0`. |
| The journey | `src/servicing/workflow.ts` | `typesafe/servicing-jev`: the servicing journey rebuilt from `fs-servicing`'s own stages and rules. `classify` and `record` are each split into **reader → gate → a person's review → commit**. The reader is the regex (answering in Jev's shape at confidence 1) or Jev over the line. The gate acts at or above a threshold and hands the rest to a `human` stage. |
| Configurations | same | `regex` (the control), `jev`, `jev-gate-0.60`, `jev-gate-0.80`, `jev-gate-0.90`. Only the readers and gates differ. |
| The book | `src/servicing/book.ts` | One work item per corpus row, a population customer each, **the row's label as truth**, no arrears (the handoff isn't under test). |
| Evaluators | `src/servicing/evaluators.ts` | `typesafe/need-matches-label` (exact, `none` included, so false alarms fail) and `typesafe/need-detected` (confusion semantics: any need recorded vs any need disclosed). `fs-servicing/classified-correctly`, `disclosure-recorded` and `needs-met` are reused unchanged. |
| The experiment | `experiment/servicing-jev.json` | The `executors` axis over `regex` / `jev` / `jev-gate-0.80` / `jev-gate-0.90`, on the book, with five evaluator metrics and touches. It lives in the pack, not in `experiments/`, so CI's reference-experiment checks never see it. |
| Scripts | `scripts/smoke.ts`, `scripts/calls.ts`, `scripts/analyse.ts` | `npm run smoke:typesafe` (one live call). `npm run record -w @craftabot/pack-typesafe` (writes the call script and records it). `npm run analyse -w @craftabot/pack-typesafe` (corpus analysis from the cassette, with no calls, to `experiment/results.{md,json}`). |
| Tests | `src/servicing/workflow.test.ts` | Every row finishes under the regex and under Jev (from the cassette), with no network. The gate sends exactly the rows under its threshold to a person. |

**The one change outside the pack:** `fs-servicing`'s `ServicingItemPayload.label?.category` (`world/cases.ts`). Until now the desk's truth for `category` was *computed by the regex under test* (`assembleServicingCase` → `classificationOf`), so any classifier was scored against the regex, and the regex against itself. A labelled item's truth is now its label. An unlabelled item is unchanged, and `fs-servicing`'s 48 tests pass as they were.

**Experimental hygiene:**
- **Corpus and questions frozen before the recording.** SHA-256 over their canonical JSON: corpus `46379f9f…a8695fc`, questions `505749c5…d98e9f`. The cassette's `argsDigest` per entry proves which questions were asked.
- **Thresholds fixed in advance.** They are TypeSafe's own bands, and none was tuned.
- **The reviewer in the gated configurations answers from truth.** That makes those rows an upper bound on what a gate buys, not a claim about people.

## 9. Results — `jev-1.13.0` on the servicing corpus (recorded 2026-09-28)

Full tables are in `packages/packs/typesafe/experiment/results.md` (the corpus analysis, with every misread row listed) and `servicing-jev.experiment-result.md` (the harness experiment through the journey). Rates are counts with Wilson 95% intervals. n = 95 per question.

**Accuracy against the label:**

| | regex | Jev | Jev by tag (plain / paraphrase / trap / mixed) | regex by tag |
|---|---|---|---|---|
| Request (classify) | 54% (51/95; 44–63) | **99%** (94/95; 94–100) | 100 / 100 / 94 / 100 | 100 / 31 / 31 / 83 |
| Support need (record) | 62% (59/95; 52–71) | **98%** (93/95; 93–99) | 100 / 100 / 88 / 100 | 95 / 53 / 56 / 42 |

**Vulnerability detection (FG21/1), any need recorded vs any disclosed:**

| | recall | precision | tp / fn / fp / tn |
|---|---|---|---|
| regex | 35% (16/46; 23–49) | 73% (16/22; 52–87) | 16 / 30 / 6 / 43 |
| Jev | **100%** (46/46; 92–100) | 96% (46/48; 86–99) | 46 / 0 / 2 / 47 |

**Calibration.** The expected calibration error is 0.023 (request) and 0.014 (need); the Brier score is 0.014 and 0.022. The important part: **every one of Jev's three errors sits at confidence 0.55–0.69**, and every answer at 0.80 or above was right (93/93 requests, 92/92 needs). The three errors are:
- d16, "My husband died recently and I'm finding it hard to cope with the bills": read as a bereavement request at 0.61. The label says disclosure. A person might read it either way.
- a17, "The previous owner of my new house passed away…": the need read as bereavement at 0.64.
- d17, "I'm ill with worry about my overdraft": the need read as health at 0.55.

**The gate.** The reviewer is modelled as always right.

| threshold | request rows to a person | need rows to a person | accuracy of what's left |
|---|---|---|---|
| 0.80 | 2% (2/95) | 3% (3/95) | 100% / 100% |
| 0.90 | 7% (7/95) | 3% (3/95) | 100% / 100% |
| 0.99 | 22% | 11% | 100% / 100% |

At 0.80 the gate catches all three errors for **5 reviews in 95 cases**.

**Through the journey (the harness experiment, run offline from the cassette):**
- `needs-met` rises from 53.7% to 98.9% (Jev) and 100% (gated). Δ +45.3 points, 95% interval +34.5 to +55.3.
- `classified-correctly` and `need-matches-label` match the corpus analysis exactly.
- The regex's misreads have consequences on the file. a13 ("moved onto a new **estate**"), a15 ("my phone **died**") and a17 are read as bereavements. Each of those journeys goes on to four-eyes and **closes the customer's account**, then hands the "estate" to advice.
- The harness's verdict is `not-supported`, but only through its power rule: it wants at least five events on each side, and Jev's condition has fewer than five failures. Every interval excludes zero by a wide margin. The verdict is a ceiling artefact, not doubt about the effect.

**Latency and cost.** Per call (one question): p50 242 ms, p95 294 ms, max 543 ms. Mean 435 input tokens. The whole corpus (190 calls) cost **$0.0035**, about $0.00004 a case.

**Findings about Craft A Bot itself:**
1. **`fs-servicing/disclosure-recorded` can never pass for a need disclosed alongside a request** (86.3% under every reader, 13/13 such rows failing). The servicing journey runs `act` before `record`, and the control demands the record before the act. That is a design contradiction in `fs-servicing` (`workflow.ts`'s stage order against `evaluators/index.ts`), independent of Jev.
2. **The truth was the rule** (fixed here with the label hook, §8). Every earlier `classified-correctly` figure on the servicing desk measured agreement with the regex, not correctness.
3. **`touches` counts a review twice** when its answer isn't the stage's first option (`human-load.ts`: `human:` plus `escalated:`). For a classification review, "escalated" means nothing. Count the `*-review` stages instead: 5 at 0.80, 10 at 0.90.

**What this does not show:**
- **The corpus is too easy for Jev to separate the gated configurations.** Jev is at the ceiling. A v2 needs harder rows: longer calls, two requests in one, sarcasm, non-native English, mid-call disclosures in a transcript.
- **The corpus was written by one author**, who also wrote the labels and predicted the tags. Real calls will be messier. The regex's poor paraphrase score is partly by design, since the paraphrase rows were written to avoid its words.
- **n = 95 per question.** The intervals are wide: Jev's 99% is anywhere from 94 to 100.
- **Adversarial robustness (§4 item 6) is untested here.** That is use case 4, the merchant's note.
- **One model version, one recording.** `jev-latest` will move. The cassette pins what `jev-1.13.0` said on 2026-09-28.

**Next, if we continue:**
- A harder v2 corpus, labelled by someone other than its author.
- The same line as a `stage-out` vulnerability guard on the collections and advice desks (use case 2).
- The disputes merchant's note as an injection test (use case 4).
- Fixing finding 1 in `fs-servicing`: record before act, or have the control read the journey's order.

## Sources

TypeSafe docs: [introduction](https://docs.typesafe.ai/introduction), [API reference](https://docs.typesafe.ai/api), [models](https://docs.typesafe.ai/models), [primitives](https://docs.typesafe.ai/primitives), [confidence](https://docs.typesafe.ai/confidence), [jev-1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13), [state](https://docs.typesafe.ai/concepts/state), [guardrails cookbook](https://docs.typesafe.ai/cookbooks/llm_guardrails), [confidence routing](https://docs.typesafe.ai/patterns/confidence-routing), [JS SDK](https://docs.typesafe.ai/sdk/javascript), [use-case map](https://docs.typesafe.ai/concepts/use-case-map), [full index](https://docs.typesafe.ai/llms.txt); [launch post](https://typesafe.ai/blog/introducing-system-one-models-and-jev).
