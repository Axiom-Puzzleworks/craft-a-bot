# 99 — The DGX Sparks: local LLMs as a Craft A Bot provider and classifier

> **Status (2026-09-28):** outside any work package. Built on branch `jev-servicing`, in `@craftabot/pack-dgx-spark` (`packages/packs/dgx-spark/`). It gives two things:
> - the builder's own two NVIDIA DGX Sparks as an **LLM provider**, so any agent's brain can run on them;
> - a **classifier line** that answers Jev's typed-question contract, so a local LLM can be compared with Jev on the servicing experiment (`98-JEV.md`).
>
> The Spark-side operations (modes, models, switching, monitoring) live in the Spark project folder (`README.md`, `MODES.md`, `QUICK-REFERENCE.md`, `PUZZLE-LLM-INTEGRATION.md`), outside this repository. This note covers only what Craft A Bot relies on.

## 1. What it is

Two DGX Spark units sit on the builder's network: `spark-619c` and `spark-ef08`. Each runs vLLM (0.27.1, NVIDIA NGC image) with an OpenAI-compatible API on port 8000. They are two **independent servers**, not a cluster.

Each runs one **mode** at a time. The mode decides which model is served, and under which name:

| mode | model directory | served as | context | streams |
|---|---|---|---|---|
| `puzzle` | `Qwen3.5-122B-A10B-NVFP4` | `puzzle-llm`, `tidy` | 40k | 8 |
| `lang-single` | `Qwen3.5-122B-A10B-NVFP4` | `qwen3.5-122b` | 131k | 4 |
| `chat` | `Qwen3.6-35B-A3B-NVFP4` | `qwen3.6` | 262k | 8 |
| `coder-27b` | `Qwen3.6-27B-NVFP4` | `qwen3.6-27b` | 131k | 6 |
| others | coder and Nemotron models, ComfyUI (no LLM) | | | |

Both units were in `puzzle` mode, idle, on 2026-09-28.

## 2. Reaching them (`endpoints.ts`, `transport.ts`)

**The four hosts.** They are fixed in `endpoints.ts`:
- `spark-619c` and `spark-ef08` (LAN);
- `100.119.19.90` and `100.103.182.73` (Tailscale, away from home).

They are the pack's whole egress (`SPARK_EGRESS`, WP41), so the session's guard refuses any other host. They are not a Settings field, for the same reason as `pack-ollama`'s loopback rule (`40-DEBTS.md` §4.3). A host's `endpoint` option only chooses which of the four goes first.

**Routing by model, not by name.** A caller names a model directory (`Qwen3.5-122B-A10B-NVFP4`) or a served name. The transport asks each unit's `/v1/models` (cached for 60 s) and matches on the `root` field. So a cartridge keeps working when the operator switches a unit from `puzzle` to `lang-single`: the served name changes, and the directory does not.

**Failover.** Units are tried in order: LAN first, then Tailscale, with the preferred unit first. A unit is skipped for the next one when any of these hold:
- it is unreachable;
- it answers 502, 503 or 504 (loading);
- it answers 404 (its mode changed mid-request);
- its mode doesn't serve the model.

When no unit will do, the error names what each unit is serving and the switch command, e.g. `No DGX Spark is serving "…" right now (http://spark-619c:8000/v1: serving qwen3.6; …). Switch a unit … scripts/spark-mode.sh spark1 puzzle`.

**CORS and the browser.** vLLM answers CORS with `*`, so the classifier line is marked `browserCapable: true`. A page served over **http** on the LAN, such as the dev server, could call it. The published site is served over https, and a browser blocks https→http requests (mixed content), so the published Workshop cannot reach a Spark directly. See §7.

## 3. The provider (`provider.ts`, `catalogue.ts`)

`dgx-spark` is a keyless provider, like `ollama`. It speaks the OpenAI chat-completions wire and reuses `pack-ollama`'s request body, SSE parser and stream accumulator. It streams, and it carries tool calls: every LLM mode runs vLLM with `--enable-auto-tool-choice`.

It always sends `chat_template_kwargs: { enable_thinking: false }`. The Qwen models otherwise spend the token budget on a reasoning block first (`PUZZLE-LLM-INTEGRATION.md` §3.1).

Errors are in the Spark's own words:
- **provider-down**, naming the units and the switch command;
- **network**, "Could not reach a DGX Spark…";
- **malformed** for a context overflow, and **provider-down** for 5xx.

`validateKey` reports what each unit is serving.

| cartridge | model | for |
|---|---|---|
| `dgx-spark/giant-qwen` "Spark Giant" | `Qwen3.5-122B-A10B-NVFP4` | the strongest model; `puzzle` or `lang-single` mode |
| `dgx-spark/quick-qwen` "Spark Sprinter" | `Qwen3.6-35B-A3B-NVFP4` | fast; `chat` mode |
| `dgx-spark/coder-qwen` "Spark Tinkerer" | `Qwen3.6-27B-NVFP4` | tools and code; `coder-27b` mode |

**Where it is installed.** The pack is in the **harness's default pack list** (`packages/harness/src/config.ts`), next to `ollama`. So `craftabot` can run any kit whose Brain cartridge is a Spark cartridge, and `craftabot packs` lists the provider as keyless. It is **not** yet in the Workshop or Kit's pack list (`apps/workbench/src/lib/packs.ts`); see §7.

## 4. The classifier line (`classifier.ts`)

`dgx-spark/classifier`, operation `system-one`, takes exactly the arguments Jev's line takes: a `model`, a `state`, and named typed questions. It returns exactly Jev's answer shape. So the servicing journey's reader can be either one (`98-JEV.md` §8), and every answer can be compared row for row.

**One question is one completion:**
- a fixed system prompt ("You are a careful classifier…");
- the user message is `{ state, question: instructions, options: { key: description } }` as JSON;
- temperature 0, `seed` 1, `max_tokens` 16;
- **constrained to the option keys** with vLLM's `structured_outputs: { choice: [...] }`. The older `guided_choice` parameter is silently ignored on this vLLM, which was checked 2026-09-28;
- `logprobs: true, top_logprobs: 20`.

**Probabilities.** Under the constraint, the first token's top log-probabilities cover the options' possible first tokens (`card`, `c`, `car`, `disc`, `d`, …). Each token's probability goes to the options it is a prefix of, split evenly when it begins more than one. The total is normalised over the options. The data records, for every question:
- `covered`: how much of the first token's mass fell on the options;
- `ambiguous`: how much was split.

The chosen option is the argmax.

**Confidence.** This is **Jev's own formula** for a choice, `(n·p_max − 1)/(n − 1)`, taken from TypeSafe's documentation. A confidence of 0.8 then means the same function of the distribution for both readers. The *distributions* come from different places. Jev is trained for calibrated decisions (RLCD). The Spark's are a generative model's next-token probabilities, and nothing trained them to be calibrated. The comparison measures exactly that difference.

**Other question types.**
- A **noul** is a choice between `yes` and `no`, with the criteria as descriptions; the answer is P(yes).
- A **score** is a choice over the level indices; the answer is the expected index.

**Latency.** A q2 request (the request plus the steer) is two completions where Jev makes one call. The Spark's per-call latency is the sum.

**Six decimal places.** Probabilities, confidences, nouls and scores are rounded to six places. Full doubles carry runs of 15–17 digits, and the repository's synthetic sweep (hard rule 9) read twelve of them in the first recording as card numbers. The first 1,224 recorded answers were rounded the same way after recording. That is a deterministic transform, and it changed no figure in the comparison. The sweep itself was not relaxed.

**Recorded, like every line. Live only under `craftabot record`, with the guard allowing the four hosts. The cassette is `src/cassettes/dgx-spark-classifier.craftabot-cassette.json`. Tests, the harness experiments and the analysis replay it with no network.

## 5. The comparison with Jev

**Results (2026-09-28, 1,224 classifications, 0 failures):**

- **Support need:** the Spark (Qwen3.5-122B) **matches Jev**. It is within ±3 points on every run, both are at 94% on held-out v3 under q2, and vulnerability recall is 94–100%.
- **Request:** the Spark **trails Jev by 1–5 points in every run**. No paired difference is significant (p ≥ 0.125).
- **Where it goes wrong:** its request errors are mostly bereavement calls read as disclosures, and confidently (0.91–0.96). Its request probabilities are 1.4–8 times worse by Brier, so a confidence gate catches fewer of its errors.
- **The rule-bearing questions help it equally:** held-out need goes from 86% to 94% (7 fixed, 0 broken, p = 0.016), against Jev's 85% to 94%.
- **Steers:** it caught every one, 16/16 and 11/11.
- **Speed:** about 0.8 s a question against Jev's 0.24 s, one at a time.

**The 35B chat model (Qwen3.6-35B-A3B, `chat` mode, 1,224 more classifications on `spark-ef08`):**

- **Request:** it **equals Jev on four of the six runs and beats the 122B on all six**. Its bereavement misreads are less confident (0.80–0.89), so a gate catches more of them.
- **Need:** usually 1–3 points behind.
- **Calibration:** on the request, better than the 122B and behind Jev.
- **Speed:** about 165 ms a question, **faster than Jev** and a fifth of the 122B. The whole recording took 5 minutes.
- **Tokens:** identical to the 122B (the same prompts and tokenizer family): 516 a case, against Jev's 1,103 counted by Jev's own tokenizer.

For this classifier, the smaller model is the better choice. The lab record's §15 has the detail.

`98-JEV.md` §12 and `packages/packs/typesafe/experiment/README.md` §14 hold the design and results. In short:
- The same three corpora and both question sets (q1, q2) were put to the Spark (Qwen3.5-122B-A10B, `puzzle` mode, `spark-619c`) through this line.
- The servicing journey gains the configurations `spark`, `spark-gate-*`, `spark-q2` and `spark-q2-gate-*`.
- There are three harness experiments: `servicing-spark{,-v2,-v3}.json`.
- `analyse.ts … spark` scores the Spark the same way as Jev.
- `summary.ts` puts them side by side, with a paired sign test per run.

## 6. Tests and the smoke

- **`packages/packs/dgx-spark/src/spark.test.ts`**: 11 tests, offline. A fake `fetch` plays the two units. They cover:
  - the endpoint rule;
  - routing by directory;
  - failover past a down or loading unit;
  - the error when nothing serves the model;
  - the provider's streamed wire with thinking off;
  - the prefix folding of log-probabilities (including an ambiguous token);
  - Jev's confidence formula;
  - choice, noul and score answers;
  - plain failures.
- **`packages/packs/typesafe/src/servicing/workflow.test.ts`**: runs every corpus row through the journey under `spark` and `spark-q2-gate-0.80` from the cassette, and checks the gate routes by confidence and steer as it does for Jev.
- **`npm run smoke:spark`** (never in CI) lists what each unit serves, streams one chat through the provider, and runs one classification through the line. It passed on 2026-09-28: chat in 621 ms, classification in 1.1 s.

## 7. Not done, and why

- **The Workshop and the Kit.** Adding the pack to `apps/workbench/src/lib/packs.ts` would put three cartridges on the Kit's shelf and a provider in the Workshop. That changes every edition's bundle and its visual baselines, and the published https site could not reach the http Sparks anyway (mixed content). It needs a decision:
  - dev and LAN builds only;
  - or an https reverse proxy on the Sparks (e.g. Tailscale serve);
  - or both.
- **Load across both units.** The transport prefers the first unit that serves the model and fails over. It does not spread load. `craftabot record` calls one at a time, so a spread would not have sped the recording. A batch runner with 8 streams per unit (`PUZZLE-LLM-INTEGRATION.md` §2b) is the model for a future `concurrency` option.
- **Other modes' models under the classifier.** The 122B (`puzzle`) and the 35B (`chat`) are done. The coder and Nemotron modes are not. A reader for another model is one entry in `SPARK_READER_MODELS` (`questions.ts`), a switch, and a recording.
- **Speculative decoding.** `puzzle` mode runs MTP speculative decoding. The recorded log-probabilities are what vLLM returned under it at temperature 0. They were not cross-checked against a run without MTP.

> **Amended 2026-09-30 (WP120, `104-READERS.md` §10.4; G90):** `@craftabot/pack-dgx-spark` left the harness's default pack list: its four hosts are the builder's. It is opt-in by `packages/packs/dgx-spark/craftabot.config.mjs`, and the typesafe pack's config installs it with Jev. The classifier line keeps its transport and its cassette. Its log-probability fold is now `governance`'s `foldFirstToken` (the LLM reader's), with `distributionOver` kept as that function's name here. In the servicing journey the two Sparks are hosted readers, `typesafe/reader/spark-122b` and `-35b`.

## 9. Patterns: standing the Sparks up, shutting them down and swapping one use for another

> **Added 2026-10-04 (outside any work package).** Built on `spark-patterns`. The Sparks have other uses than Craft A Bot: the Logic Grid Puzzle software (`puzzle` mode), the Cohort Parity Fairness project (`cpf-large`), coding agents, ComfyUI. Craft A Bot therefore never *owns* a unit. It borrows it for a named **pattern**, remembers what the unit was doing, and puts that back.

**Access, checked 2026-10-04 with both units on.** Both `spark-619c` and `spark-ef08` answered on all four addresses (the two LAN names and the two Tailscale IPs). Both were in `puzzle` mode, idle, serving the 122B as `puzzle-llm` and `tidy` (40,960 context). `npm run smoke:spark` passed: a chat in 971 ms, a classification in 3.7 s. A full agent run through `craftabot run --brain live --provider dgx-spark` (the snackbot kit with the Spark Giant cartridge) completed six ticks with tool calls, each think taking 3.5 to 4.1 s for about 65 output tokens, with `durationMs`, the parameters and the four-host egress on the trace.

**What was missing, and is now built:**

| Gap found | Built |
|---|---|
| The transport sent every call to the first unit that served the model. Measured: one unit saturates at 8 streams (89 tok/s); 16 calls queued to 28.6 s. Spread 8+8 over both units: 157 tok/s, 16.3 s, **1.8 times** the throughput. | `createSparkTransport` is `spread` by default: of the units serving the model, the one with the fewest requests **in flight** goes first, ties in the configured order, so one caller at a time behaves exactly as before. A unit's LAN and Tailscale addresses count as one unit. The count is held per process (every provider, the classifier and a pool of cells share it) and released when a response body has been read. `strategy: 'ordered'` keeps the old behaviour. |
| Nothing said which *use* the Sparks were in, and the only way to change it was a shell script outside the repository. | **Modes** as data (`modes.ts`, mirroring the Spark project's `MODES.md`, with `owner`), **patterns** as data (`patterns.ts`), and `craftabot spark` (below). |
| `record --experiment` was one cell at a time, so the Sparks' streams sat idle. | `record --concurrency <n\|auto>`: the runner's own lanes, in one process, for a local provider only (`dgx-spark`, `ollama`; a hosted provider is refused, being rate-limited and billed per call). `auto` is the streams the reachable units serving the design's models can take at once, capped at 32. Results are placed by ordinal, and the mock recording is identical at 1 and at 4 (a test). |
| A design naming a Spark cartridge nothing served failed on its first cell. | `record --provider dgx-spark` first verifies, and says which pattern to stand up. |

**The pattern.** A pattern (`SparkPattern`) names the mode each unit runs while it is up (or `off`; a unit it does not name is left alone) and the **role** each model plays for the bank: `brain` (an agent's LLM), `seat` (the person across the desk, played live), `reader` (a typed-question classifier), `labeller` (a blind second labeller) and `redteam` (the adversarial seat), each with its cartridge and, where it matters, the context it needs and whether it reads log-probabilities. `checkSparkPattern` checks it against the mode catalogue with no network: an unknown unit or mode, a role no unit it may use can serve, an agent given a 4k-context mode, a reader given a mode not tuned for log-probabilities.

| Pattern | Units | Roles | For |
|---|---|---|---|
| `reasoning-pair` | both `puzzle` | all five on the 122B | The starter shape; a batch spreads over 16 streams. |
| `brain-and-seats` | 619c `puzzle`, ef08 `chat` | brain, labeller on the 122B; seat, reader, redteam on the 35B | A live brain and a live counterpart at once; the 35B equalled Jev on the servicing request and is five times quicker (§5). |
| `fast-pair` | both `chat` | all five on the 35B | Bulk recording where speed matters; 262k context. |
| `reader-batch` | both `cpf-large` | reader on the 122B, log-probabilities | A corpus of classifications: 64 streams a unit, single-token answers. Borrows the fairness project's mode. |
| `idle` | both `off` | none | Stand both down; monitoring stays up. |

**The commands** (`craftabot spark …`, `commands/spark.ts`):

- `status`, `patterns [--serves <cartridge>]`, `plan --pattern <id>` and `verify --pattern <id> | --for <design.json>` only look: HTTP to the four hosts, and one read-only `docker ps` over ssh to learn the exact mode from the compose project (`mode-<folder>`); with ssh down, the mode is *inferred* from the names a unit serves, only when exactly one mode serves exactly those names (`puzzle-llm` alone is shared by two modes and is `unknown`, never a guess), and the output says so.
- `up --pattern <id> --yes` plans, prints what it would **stop** and whose mode that is, then runs the Spark project's own `switch.sh <mode>` over ssh on each unit that needs it, in parallel, and verifies each role. Without `--yes` it changes nothing and exits 3. It writes the **lease** (`.craftabot/spark-lease.json`, git-ignored) *before* the first switch: what each unit was doing before any pattern took it. A second `up` with another pattern *replaces* the first and keeps the original lease, so `down` restores the Sparks as they were found, not as the last pattern left them.
- `down --yes` restores the lease (units whose earlier mode could not be learned are left alone and named; the lease stays when a unit was unreachable, so `down` can be run again). `down --off --yes` stops both units. `--lease <file>` moves the lease.
- A mode id is put in a command line only if it is a plain folder name the catalogue knows. Shared modes (one model across both units) are refused by a pattern: they are two coordinated steps with the model chosen per run, started by `scripts/spark-mode.sh shared` in the Spark project.
- `verify` exits 0 when everything is served, 1 otherwise, and names the shipped patterns that would serve what is missing.

**Replacing a pattern with another** is `up --pattern <other> --yes`; **a pattern of your own** is `--pattern-file <file>`, which passes the same check. **A new mode on the Sparks** is one entry in `SPARK_MODES` before a pattern can name it; until then `status` still reports it. The catalogue is a claim about the Sparks kept beside the code; the survey is the truth, and a pattern is verified against the survey.

**Verified live, 2026-10-04.** Every step below ran on the real units, with the puzzle software's mode as the starting state (both units `puzzle`, idle: no requests running or waiting).

| Step | Result |
|---|---|
| `status`, `plan`, `verify` | Read-only; exact mode learned over ssh; `verify --pattern brain-and-seats` exited 1 and named the pattern to stand up. |
| `up --pattern brain-and-seats` (no `--yes`) | Printed the plan, changed nothing, exit 3. |
| `up --pattern brain-and-seats --yes` | `spark-ef08` `puzzle → chat` in **6 m 45 s**; `spark-619c` untouched; all five roles ready. |
| A two-model episode | The advice-desk kit with a live **agent on the 122B** and a live **counterpart seat on the 35B** (`--counterpart live --counterpart-cartridge dgx-spark/quick-qwen`): `SUCCESS`, six rounds, 634 events; the two runs report `Qwen3.5-122B-A10B-NVFP4` and `Qwen3.6-35B-A3B-NVFP4` as their wire models. |
| `up --pattern reasoning-pair --yes` (a *replacement*) | `spark-ef08` `chat → puzzle` in **12 m 33 s**; the lease kept the original `puzzle`/`puzzle`. |
| `record --experiment … --provider dgx-spark --concurrency auto` | 16 cells at once; sampled every second, `spark-619c` and `spark-ef08` ran 6–8 requests each, about 15 of the 16 streams busy. |
| `down --yes` | Both units `puzzle`, lease cleared: the Sparks as they were found. |

**What the first live recording found.** Recording the `lending-stack` design with its brain a live `dgx-spark/giant-qwen` found two defects the offline tests could not, both fixed with a test that fails without the fix. (1) **A live brain's `cartridgeId` never reached its cell**: `specFor` built the agent from the build alone, so a live book cell asked the Spark for the model `"mock"` (`campaign.ts`: `specFor` now takes the cell's brain). (2) **A live counterpart seat's calls were untimed** (`run-duo.ts`), so its `think.completed` carried no `durationMs`. A third was in this section's own CLI: `--concurrency auto` was rejected as not a number. After the fixes: 138 cells in 19 minutes, 637 distinct answers kept.

**The first measurement of a live tier, and it does not look like the fallible one.** On the lending journey (23 loan applications per configuration, a synthetic book, `Qwen3.5-122B-A10B-NVFP4` at the cartridge's default temperature; **not** a committed result, a trial with n = 23):

| Configuration | Agrees with the rules | 95% interval |
|---|---|---|
| `rules-only` (no bot decides) | 23 / 23 | 86–100% |
| `bot-everywhere`, no guard | 14 / 23 | 41–78% |
| `bot-everywhere`, policy cards | 15 / 23 | 45–81% |
| `bot-with-a-person-at-the-decision`, no guard | 14 / 23 | 41–78% |
| `bot-with-a-person-at-the-decision`, policy cards | 15 / 23 | 45–81% |

The fallible tier's agreement is 91% (an assumed error rate of one decision in ten, `ERROR_RATES`); the live model's interval does not reach it. The errors are not uniform. Over the 46 `bot-everywhere` agent runs: **of the 18 cases the rules say to refer, the model approved 7, referred 2, declined 1 and made no decision on 8**; of the 24 to approve it approved 18; of the 4 to decline it declined 2. In 14 of the 46 runs it never made a `decide` call (a guard stop, an error, or running out of steps). So the live error sits where the rule is hardest, and its worst form is the one a control exists for: approving what should have been referred. That is the shape WP170 modelled as a *difficulty* error, and the first evidence that it is the right one. It is also why no policy card or four-eyes stage moved the figure (one case in 23, inside the interval). The cost was about 14,000 to 21,000 tokens a case, against 1,300 for the scripted tier. The cassette (14.6 MB, 637 entries) and these tables are under `runs/spark-2026-10-04/`, which git ignores; a committed result is WP168's, at a stated size and a stated temperature. Identical prompts were answered differently 205 times out of 842 repeats, so a recording at temperature 0 is the next thing to settle.

**Not done.** (1) The shared mode (235B across both units) is not a pattern. (2) The Workshop and Kit still do not list the pack (§7). (3) Load *spreading* is least-loaded by in-flight count, not weighted by a unit's speed: with two different models there is one unit per model, so it does not arise; with the same model in two modes (`puzzle` and `cpf-large`) it would. (4) `record --concurrency` is not yet asked for by any shipped design: WP168 needs it. (5) The `loadMinutes` of the 122B modes other than `puzzle` are set to match it, not measured. (5) The `loadMinutes` for the 122B modes other than `puzzle` are set to match it, not measured.
