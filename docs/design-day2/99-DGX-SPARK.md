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
