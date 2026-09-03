# 39 — The hosted evaluator: `geap/eval/*` (WP51)

> **Status:** design of record for WP51 (`27-DAY3-ROADMAP.md` Phase L's second row), written 2026-09-03 against the codebase after WP50. This is the map for `26-TARGET-DESIGN-V3.md` §6.2's third shipped evaluator — "in `pack-geap`, `geap/eval/*` over the Gen AI evaluation service … kind `hosted`, sharing the `geap` credential id" — the one `31-EVALUATORS.md` §5 and §8 D-c deferred "once a live checkpoint can be taken"; where the two differ, §7 below says why and `26-…` §12 gets a dated note when the stage lands.

---

## 1. Purpose

The evaluator contract has three kinds and two of them ship: every assertion card is `deterministic`, the rubric judge is `model`. The `hosted` kind is built into the contract — `credential`, `egress`, `createOffline`, `checkEvaluator`'s offline-present check — and nothing implements it. `25-ARMOUR-BRICK.md` §7 named the Gen AI evaluation service's `evaluateInstances` as "the natural second GEAP brick, in the same pack, after this one has proved the seams". The seams are proved: the credential id, the regional client with its scrubbed errors, the declared egress, the offline stand-in, the trace record. WP51 puts an evaluator on them — a stored run scored by a real evaluation-service call, from the harness and from the Workshop, recorded as `result.external`, gated in a campaign under a budget, and kept green in CI by fixtures.

---

## 2. Where the code actually is

**`packs/geap/src/armor/`** — `client.ts` (`createModelArmorClient`: a regional URL only, `Bearer` token from a thunk, never throws, every message through `scrubToken`), `errors.ts` (`ArmorError { kind, message }` from a status, a network failure or a timeout; `TOKEN_REDACTED`), `service.ts` (`ARMOR_CREDENTIAL_ID = 'geap'`, the credential block with `validateArmourCredential`, `egress` with the single-label wildcard host, `create`/`createOffline`), `brick-kind.ts`. **`packs/geap/src/index.ts`** — the manifest: one brick kind, one guardrail service, no evaluators. **`packs/geap/scripts/smoke.ts`** — the live smoke against a template, `GEAP_*` in the environment, never in CI. **`packs/evaluators/src/rubric-judge.ts`** — the `model` evaluator: transcript rendering, an `external` record with `outcome`, `inconclusive` for anything short of a verdict, `createOffline`. **`core/src/egress.ts`** — `hostMatches(pattern, host)`: label by label, `*` matches one whole label. **`harness/src/commands/evaluate.ts`** — a `hosted` evaluator "runs offline here until its own pack says otherwise"; `configs` keyed by evaluator id; `--rubric` is the one config flag. **`workbench/lib/workshop/evaluations.ts`** — the same: hosted runs offline in the browser. **`evals/src/campaign.ts`** — `evaluateCell` runs every non-deterministic evaluator offline with a refusing `fetch`; `budget { maxLiveCells, maxTokens? }` is required for live brains and enforced before the first cell. **`pack-testkit`** — `checkEvaluator` and `describeConformance`'s `fixture.evaluators` by id. **`docs/geap-setup.md`** — the maintainer's setup for Model Armor and the token.

**The wire** (Vertex AI discovery document, v1): `POST https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}:evaluateInstances`. One metric per request. `safetyInput { metricSpec: { version? }, instance: { prediction } }` → `safetyResult { score, explanation, confidence }`; `fulfillmentInput { metricSpec: { version? }, instance: { instruction, prediction } }` → `fulfillmentResult { score, explanation, confidence }`; `pointwiseMetricInput { metricSpec: { metricPromptTemplate, systemInstruction? }, instance: { jsonInstance } }` → `pointwiseMetricResult { score, explanation }`. The regional host is the same `location`-prefixed pattern Model Armor uses, with a dash rather than a dot.

---

## 3. Design principles

1. **One client, three metrics.** `geap/eval/safety`, `geap/eval/fulfillment` and `geap/eval/rubric` are three `Evaluator`s over one `createEvalClient`, the way three hooks share one Model Armor client. The service decides what a metric means; the pack decides what of the run to send.
2. **What is sent is the run's own words.** The prediction is the transcript the rubric judge already renders (`renderTranscript`'s shape, kept in the pack so it does not depend on `pack-evaluators`); the instruction is the goal as the bot was told it — the first composed prompt's system message. Never the spec, never a key.
3. **Live where the seams allow, offline everywhere else, and the record says which.** The harness runs live when `CRAFTABOT_CREDENTIAL_GEAP` and a project are given; the Workshop when the `geap` battery is in and the Evaluators page has a project; a campaign only under a `budget`. Offline answers `inconclusive` with `external.outcome: 'offline'`, so the Audit Centre lists the call that was not made.
4. **The score is the service's; the verdict is ours, and says so.** Safety is 0..1 as given; fulfillment is 1..5 normalised to 0..1; pointwise is normalised by a configured `scale`. A `passMark` on the config turns a score into a verdict, and the explanation names both.

---

## 4. The design

### 4.1 The client and the readings (stage A)

`packs/geap/src/eval/client.ts` — `createEvalClient({ projectId, location, timeoutMs, fetch, token })` with `evaluate(request): Promise<{ response } | { error: ArmorError }>` and `describeEvalEndpoint(config)`. The same discipline as `armor/client.ts`: a regional URL only, `Bearer` from the thunk, trimmed; never throws; `armorErrorFromStatus`/`FromNetworkFailure`/`FromTimeout` reused (they are HTTP errors, not Model Armor's), every message through `scrubToken`. `createOfflineEvalClient()` answers `{ error: { kind: 'offline' … } }` — no, offline is the evaluator's own stand-in (§4.2); the offline client is not needed and not built.

`packs/geap/src/eval/reading.ts` — `readEvalResponse(json, metric)` parses `safetyResult`/`fulfillmentResult`/`pointwiseMetricResult` with zod (unknown extra fields ignored; a missing result for the metric asked is a `'partial'` reading), returning `{ score, explanation, confidence? }`. `normaliseScore(metric, score, scale)`.

`packs/geap/src/fixtures/eval/*.json` — verbatim-shaped envelopes, best-effort from the discovery document's schema as `25-…` §8 did for Model Armor, checked by the live leg: `safety-safe`, `safety-unsafe`, `fulfillment-high`, `fulfillment-low`, `pointwise`, `failure` (a 403 body).

### 4.2 The evaluators (stage A)

```ts
export const evalConfigSchema = z.object({
	projectId: z.string().min(1),
	location: z.string().min(1),
	/** A normalised score at or above this is a pass. */
	passMark: z.number().min(0).max(1).default(0.5),
	/** Ticks of transcript to send at most, newest kept. */
	maxTicks: z.number().int().positive().default(40),
	/** `geap/eval/rubric` only: the metric prompt template, with `{transcript}` and `{goal}` placeholders, and the scale its score is on. */
	metricPromptTemplate: z.string().min(1).optional(),
	scale: z.number().positive().default(5)
});
```

`evalEvaluator(metric)` builds one `Evaluator` per metric: `id: 'geap/eval/<metric>'`, `kind: 'hosted'`, `credential` — the same block `modelArmorService` declares (`id: 'geap'`, `kind: 'oauth-token'`, the same `validate`), `egress: [{ host: '*-aiplatform.googleapis.com', purpose: 'evaluation', sends: ['trace', 'credential-header'] }]`, `configSchema: evalConfigSchema`. `evaluate(input, deps)`: parse the config (no config → `inconclusive`, "needs a project and a location"); render the transcript and the goal; build the request for the metric; call the client with `deps.fetch` and `deps.getCredential('geap')`; map the reading to `{ verdict, score (normalised), label, explanation (the service's, prefixed with the score and the pass mark), evidence (the ticks sent — the transcript's first event per tick, as the judge does), external }`. `external` is `{ service: 'geap/evaluation', method: 'evaluateInstances', endpoint, policyRef: metric, latencyMs, charsScreened, outcome }`, with `outcome` the reading's or the error's kind — the same shape the shell writes. A transport error is `inconclusive` with the error's kind as `outcome`; a token in any message is scrubbed before it reaches the result. `createOffline()` answers `inconclusive` with `external.outcome: 'offline'` and `latencyMs: 0`.

**The egress pattern.** `hostMatches` matches `*` to a whole label; `europe-west2-aiplatform` is one label. WP51 widens the matcher additively: a label pattern of the form `*-suffix` matches any label ending in `-suffix`. Every existing pattern keeps its meaning; a test pins both forms and that `*-aiplatform.googleapis.com` does not match `aiplatform.googleapis.com` or `evil-aiplatform.googleapis.com.example`.

The manifest gains `evaluators: [safety, fulfillment, rubric]`; the pack's conformance test gains a fixture per id (inputs from core's testing fixtures, a planted secret) so `checkEvaluator` covers all three. `smoke:geap` gains an evaluation leg: with `GEAP_PROJECT_ID` and the token, `safety` over a short fixed transcript; asserts the reading parses, the score is in range, and the token is nowhere in the result. The leg is the live checkpoint (§6).

### 4.3 The hosts (stage B)

**Harness.** `evaluateRun`: a `hosted` evaluator runs live when `options.credentials.get(evaluator.credential.id)` is defined *and* a config was supplied for it; offline otherwise, as today. `craftabot evaluate` gains `--project <id> --location <loc>` (and `--metric-prompt <template>` for `geap/eval/rubric`), turned into `configs` for every `geap/eval/*` id — a project id is not a secret and does not belong in `CRAFTABOT_CREDENTIAL_*`. `--egress none` forces offline.

**Workshop.** `runEvaluator`: a `hosted` evaluator runs live when the vault holds its credential and `options.config` is supplied; offline otherwise. The Evaluators page gains, for `geap/eval/*`, project and location fields (kept in `localStorage` under `cab.geap-eval.v1`, beside the Sinks' own preference pattern) and a line saying whether the run will be live (battery in, project set) or offline. A CORS refusal is what it is: `external.outcome: 'unavailable'`, recorded, and the live checkpoint (§6) is what says whether the browser can call the endpoint directly.

**Campaigns.** `RunCampaignOptions` gains `credentials?: (id: string) => string | undefined` and `fetch?`. `evaluateCell` runs a `hosted` evaluator live only when the campaign has a `budget`, the caller supplied a credential for it, and the campaign's own `evaluators[].config` carries the project — otherwise offline, as every non-deterministic evaluator is today. `budget` gains `maxLiveEvaluations?: int` (default: no cap beyond `maxLiveCells`' existence); the count is enforced before the first cell (`cells × live hosted evaluators`), like `maxLiveCells`. The report's `budget` gains `liveEvaluations`. `runCampaignFile` passes `credentialsFromEnv` and honours `--egress none`. A gate of kind `evaluator-pass-rate` over `geap/eval/safety` is then a real gate under a budget, and `inconclusive` cells stay out of its denominator as WP43 set.

### 4.4 Docs

`docs/geap-setup.md` gains §7: enabling `aiplatform.googleapis.com`, `roles/aiplatform.user`, the `GEAP_PROJECT_ID`/`GEAP_LOCATION` the smoke leg reads, what leaves (the transcript), and the price line with its date.

---

## 5. Non-goals

Pairwise, trajectory and the other thirty metrics; the multimodal `contentMapInstance`; `autoraterConfig`; the browser sign-in flow for a second scope (the `cloud-platform` scope already covers the evaluation service); an in-run hosted judge (the Monitor Judge is `model`-kind and stays so).

---

## 6. Stages, and the live checkpoint

- **A — the pack.** Client, readings, fixtures, the three evaluators, the manifest, the conformance fixtures, the egress matcher widening in core with its tests, the smoke leg.
- **B — the hosts.** Harness flags and live path; Workshop live path and page fields; campaign credentials, budget cap and live count; harness campaign wiring; `docs/geap-setup.md` §7.
- **C — close-out.** Stage notes here; `26-…` §12; `27-…` row and §8 item 20; `31-…` §5/§8 D-c notes; `25-…` §7 note; `CLAUDE.md`; the README map.

**The live checkpoint** (`27-…` §5 rule 2, `25-…` §11 stage B's mould): `npm run smoke:geap` with `GEAP_ACCESS_TOKEN`, `GEAP_PROJECT_ID`, `GEAP_LOCATION` set runs the Model Armor leg and then the evaluation leg — a real `evaluateInstances` call, the reading parsed, the score in range, the token absent from the result. The browser half (CORS on `{location}-aiplatform.googleapis.com`) is taken from the Evaluators page with the battery in. Both are recorded as a dated note in this doc's stage A note; if the token to hand has expired, the note says the checkpoint is pending and how to take it, as `30-…` did for Azure.

---

## 7. Divergences from `26-…` §6.2 and `31-…`, with reasons

- **The egress matcher grows a `*-suffix` label form.** §6.6's single-label wildcard cannot name `{location}-aiplatform.googleapis.com` without naming every Google host; a suffix wildcard names exactly the evaluation service's regional hosts. Additive; every existing pattern is unchanged.
- **Three metrics, not one `geap/eval/safety`.** §6.2's example id was one; the client is the same for all three and fulfillment is the one that answers "did it do the goal", which is what a campaign gate wants.
- **A campaign's live evaluations are budgeted separately.** `maxLiveCells` counts brains; a hosted evaluator over a scripted cell is spend without a live brain, so it has its own cap and its own count on the report.
- **The project id travels as config, not credential.** `CRAFTABOT_CREDENTIAL_*` is for secrets; a project id is on every URL the service returns and belongs beside the location, in the evaluator's config.

> **Amended 2026-09-03 (stage A done).** As §4.1–4.2. `packs/geap/src/eval/` — `client.ts` (`createEvalClient`, `describeEvalEndpoint`; the armour client's discipline and error kinds reused), `reading.ts` (`readEvalResponse` over `safetyResult`/`fulfillmentResult`/`pointwiseMetricResult`, `normaliseScore`), `transcript.ts` (the judge's rendering kept in the pack, `goalText` from the first composed prompt's system message), `evaluator.ts` (`evalConfigSchema`, `evalRequestFor`, `evaluateWithService`, `offlineResult`, `evalEvaluator(metric)` and the three instances); `fixtures/eval/*.json` from the v1 discovery document's schema, exported as `evalFixtures` so a host's tests answer with them. The manifest ships `evaluators`; the conformance test covers all three through `checkEvaluator` over the pack's own golden trace. Core's `hostMatches` gained the `*-suffix` label form with its own test file. The smoke test gained the evaluation leg. **The live checkpoint is pending:** the token in the maintainer's environment had expired (`bad-token` on the Model Armor leg, so the evaluation leg never ran) and no `gcloud` is on this machine to mint another. To take it: `GEAP_ACCESS_TOKEN="$(gcloud auth print-access-token)" GEAP_PROJECT_ID=… GEAP_LOCATION=europe-west2 GEAP_TEMPLATE_ID=cab-armour npm run smoke:geap` — the leg prints the outcome, the score and the explanation, and fails on a shape it cannot read; then, for the browser half, the Evaluators page with the battery in and a project set, reading the record's `outcome` (`ok`, or `unavailable` for a CORS refusal). Record both here when taken.

> **Amended 2026-09-03 (stage B done).** As §4.3–4.4. Harness: `evaluateRun` runs a hosted evaluator live with its credential, a config and `egress !== 'none'`; `craftabot evaluate --project <id> [--location] [--metric-prompt] [--egress]` builds the `geap/eval/*` configs. Workshop: `runEvaluator` is live when the vault holds the evaluator's credential and a config is handed in; the Evaluators page keeps a project, a location and the rubric metric's template under `cab.geap-eval.v1` and says, per evaluator, whether the run will be live or why not. Campaigns: `RunCampaignOptions.credentials`/`fetch`, `runsLive` (hosted + budget + credential + config + network), `budget.maxLiveEvaluations` enforced before the first cell, `budget.liveEvaluations` on the report; `runCampaignFile` passes the environment's credentials. `docs/geap-setup.md` §7. Tests: `harness/commands/evaluate-hosted.test.ts` (live with the call recorded and the token absent; offline without the battery, without a project, and under `--egress none` from the CLI), `evals/campaign-hosted.test.ts` (a real `evaluator-pass-rate` gate over `geap/eval/safety` under a budget, the count, the cap refusing, the three offline cases), `workbench/lib/workshop/evaluations-hosted.test.ts` (offline without the battery or a config; live through `globalThis.fetch` with both). The transcript fixture in the Workshop test needed the run stored under the events' own run id — the memory store indexes events by the id they carry.

> **Amended 2026-09-03 (stage C — WP51 closed).** Gate: lint, every suite green, build within budget, e2e 159/159 (`duo-persistence` failed once under load and passed alone — the known debt). `31-…` §5 and §8 D-c, `25-…` §7 and `26-…` §12 carry dated notes; `27-…` §8 item 20 the summary. The live checkpoint stands pending as stage A's note says.
