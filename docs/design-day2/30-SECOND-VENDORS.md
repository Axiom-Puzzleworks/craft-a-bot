# 30 — Second and third guardrail services, and the Guard Rack (WP42)

> **Status:** design of record for WP42 (`27-DAY3-ROADMAP.md` Phase I), written 2026-09-02 against the codebase after WP41. This is the map for `26-TARGET-DESIGN-V3.md` §6.1's "next vendor" test and §9's vendor posture; where the two differ, §7 below says why and `26-…` §12 gets a dated note when the stage lands. Read `29-GUARD-SHELL.md` first — every service here is a client, a reading and some strings on that shell, and nothing else.

---

## 1. Purpose

WP39 made the claim that a vendor is *client + reading + strings + fixtures* and no mechanism. WP42 is where the claim is tested twice, from opposite directions: a classifier that runs on the user's own machine with no credential at all, and an enterprise service with a key, a region and a quota. If both fit `workshop/guard` with no change outside their own directory, `26-…` acceptance 1 holds. The Guard Rack is the screen that makes the collection visible: every registered service, what it needs, where it calls, whether it is plugged in, and one button to fit it into a bot.

---

## 2. The vendor choice (stage A's written comparison)

The row asks for one enterprise vendor from three, chosen by auth model, CORS, request shape and free tier.

| | AWS Bedrock Guardrails `ApplyGuardrail` | Azure AI Content Safety (Prompt Shields + `text:analyze`) | Lakera Guard |
|---|---|---|---|
| **Auth** | SigV4 request signing — needs a signing library or STS-vended credentials in the browser; the vault holds one secret, not four | A single header, `Ocp-Apim-Subscription-Key` — exactly the `header` credential kind WP41 added and nothing has used | `Authorization: Bearer <key>` — the `bearer-token` kind |
| **CORS from a browser** | No — Bedrock runtime endpoints do not answer preflight for arbitrary origins | Not documented as browser-callable; a live checkpoint decides (`browserCapable`), the harness is the fallback host | Not documented; same |
| **Request shape** | One call: content blocks + `source: INPUT/OUTPUT`; response is a nested assessment per policy type | Two calls: `text:shieldPrompt` (`userPrompt`, `documents[]` → `attackDetected` each) and `text:analyze` (`categoriesAnalysis[{category, severity}]`); both flat and small | One call: `messages[]` → `flagged` + a per-detector breakdown |
| **Neutral categories** | content filters (hate, insults, sexual, violence, misconduct, prompt attack), PII, topics, words | injection (prompt shield, direct vs indirect), harmful × 4 with a 0–6 severity | prompt attack, PII, moderated content, unknown links |
| **Free tier** | none as such (pay per text unit) | F0: 5,000 records/month, no card | a community tier exists, terms shift |
| **Fit for this WP** | the auth model alone rules it out for a browser-first pack | the only one that exercises the `header` kind; a real free tier; two small calls the shell already knows how to time | simplest wire shape, but its v2 breakdown vocabulary is the least stable of the three |

**Decision (D1): Azure AI Content Safety.** The `header` credential kind gets its first user, the free tier makes the live checkpoint reproducible for anyone with an Azure account, and the two-call shape is a good test that a service may make more than one request per screen without the shell caring. Bedrock is recorded as the one that *cannot* be a browser pack under this architecture (SigV4), which is itself a useful fact for `26-…` §9. Lakera is the natural third if a one-call vendor is ever wanted.

**Decision (D2): the local pack is `@craftabot/pack-guard-local`, two services over the user's own Ollama.** `guard-local/llama-guard` runs Llama Guard 3/4 (`llama-guard3` in Ollama's library) through `/api/chat` and parses its `safe` / `unsafe\nS1,S9` answer against the fourteen-category taxonomy; `guard-local/prompt-guard` runs a prompt-injection classifier through `/api/generate` and parses a `BENIGN` / `INJECTION` / `JAILBREAK` label. **Caveat recorded:** Llama Prompt Guard 2 is a sequence classifier, not a chat model, and Ollama's public library does not serve it as one at the time of writing; the service takes any model name and parses the label, so a user can serve the classifier behind a Modelfile, and the fixtures — not a live model — are what CI runs. Neither service has a credential; both declare `localhost` and `127.0.0.1` as egress and nothing else.

---

## 3. Where the code goes

```
packages/packs/azure-content-safety/src/
  index.ts        manifest { id: 'azure-content-safety', guardrailServices: [contentSafetyService] } — no brick kinds
  service.ts      the GuardrailService: config { endpoint, analyzeHarm }, credential { id: 'azure-content-safety', kind: 'header', headerName: 'Ocp-Apim-Subscription-Key' }, egress '*.cognitiveservices.azure.com'
  client.ts       shieldPrompt + analyze over the injected fetch and the shell's AbortSignal; never throws; scrubs the key
  reading.ts      the two wire envelopes → ScreenReading: 'prompt-shield' (injection) + 'Hate'/'SelfHarm'/'Sexual'/'Violence' (harmful, severity → confidence)
  strings.ts      nothing to say beyond the shell's defaults — kept as the place the vendor's own words would go
  fixtures/       shield-clean, shield-attack, analyze-clean, analyze-violence, unauthorized — verbatim response bodies
packages/packs/guard-local/src/
  index.ts        manifest { id: 'guard-local', guardrailServices: [llamaGuardService, promptGuardService] }
  ollama.ts       the shared /api/chat and /api/generate client — one call, one parse, never throws
  llama-guard.ts  the service and its reading (S1–S14 → categories; S4 always stops)
  prompt-guard.ts the service and its reading (label → injection/jailbreak)
  fixtures/       llama-guard-safe, llama-guard-unsafe, prompt-guard-benign, prompt-guard-injection, prompt-guard-garbled
```

Both packs depend on `@craftabot/core` and `zod` only. Neither ships a brick kind: `workshop/guard` is how they are fitted, which is the point.

---

## 4. Screening shape, per service

| Hook | Azure | Llama Guard | Prompt Guard |
|---|---|---|---|
| `pre-think` (observation) | `shieldPrompt` with the text as a **document** (indirect attack); `analyze` on the text | one `user` turn | the text as the prompt |
| `pre-act` (decision) | `shieldPrompt` with the text as the **user prompt** and the observation, if any, as a document; `analyze` | one `user` turn | the text |
| `post-act` (result) | as `pre-think` | one `user` turn | the text |

`analyze` is skipped when `analyzeHarm` is `false`, which halves the calls for a pure injection screen. Prompt Guard declares only what it can judge — it is fitted at all three hooks but its findings are always `injection`/`jailbreak`.

Readings, in the shell's vocabulary: Azure `attackDetected` → `injection`, vendor label `prompt-shield` (`prompt-shield:documents` when it was the document that tripped), no confidence; `categoriesAnalysis` → `harmful` per category with `severity` 2/4/6 → `low`/`medium`/`high` and `vendorConfidence` `"severity:N"`, `matched` when severity ≥ 2. Llama Guard `S1`–`S14` → `harmful` except `S7 Privacy` → `sensitive-data`; `S4 Child Exploitation` is in `alwaysStop`; a category is `matched` when it appears after `unsafe`. Prompt Guard `INJECTION` → `injection`, `JAILBREAK` → `jailbreak`, `BENIGN` → neither; a label it does not know is a `partial` reading, not a match.

---

## 5. The Guard Rack (`/workshop/guards`)

One row per `registry.listGuardrailServices()`: name and id, the hooks it screens, the credential it needs and whether the vault holds one (never the value), its egress hosts, and three actions — **Test on a fixture** (the offline client over a canned request, so a person sees the vendor's vocabulary without a key), **Fit into a bot** (a picker over the shelf; adds a `workshop/guard` brick with this `serviceId`, `serviceConfig` from the rack's own small form, `screening.offline` on), and, where the service declares a credential with `validate`, **Test the guard** for real. `/workshop/armour` becomes a redirect to the rack, and the rail entry "Cloud Armour" becomes "Guards".

The rack does not build clients for a live call itself — "Test the guard" goes through `credential.validate(secret, fetch, config)` as WP41 put it on the kind, and Model Armor is the one service that has it today.

---

## 6. The baseline campaign

`injectionBaseline()` gains two guards, both offline stacks through `workshop/guard`: `local-llama-guard` (`starter/safety` + `workshop/guard` → `guard-local/llama-guard`) and `azure-content-safety` (`starter/safety` + `workshop/guard` → `azure-content-safety/content-safety`), each `for` every scenario. Offline, both answer clean, so they add cells and hosts to the report without changing any gate's verdict — the point is that the file names the stacks and CI runs them under `--egress none`. The committed JSON is regenerated (320 → 480 cells) and the campaign e2e's cell count moves with it.

---

## 7. Divergences from `26-…`, with reasons

- **D-a — the local pack's Prompt Guard is model-agnostic** (§2's caveat): the row names Llama Prompt Guard 2 by name; the service names a model the user chooses and parses a label, because the classifier is not a chat model Ollama serves.
- **D-b — Azure needs two calls per screen.** `29-…` §4.3's `screen` is one call in every example; nothing in the contract said one, and the shell times the whole `screen`. Recorded so the next vendor knows it is allowed.
- **D-c — the `header` kind's value goes on the wire as a header the service names** (`headerName`), and the leak sweep plants it like any other secret.

Stage notes are appended below.

> **Amended 2026-09-02 (Stage B — the live checkpoint, not yet taken).** No Azure AI Content Safety resource or key is available in the environment this WP was built in, so the checkpoint `25-…` §11 stage B set the mould for — a real verdict, CORS go/no-go, latency — **has not been taken**. What stands in its place, honestly: `browserCapable: false` on the service, so the browser never attempts a live call and the harness is the live host; the request and response shapes are the `2024-09-01` shapes from the service's public reference, held as fixtures; and "Test the guard" is wired through `credential.validate` so the first person with a key takes the checkpoint from the Guard Rack in one click and records the numbers here. Until then this note is the dated record `27-…`'s row asks for, and the row says so.

> **Amended 2026-09-02 (Stage C).** The Guard Rack landed at `/workshop/guards` as §5 describes: one row per registered service with hooks, credential kind and plugged-in state (never the value), egress hosts and `browserCapable`; a settings block prefilled from the service's own schema; **Test on a fixture** (the offline client), **Test the guard** (through `credential.validate`, enabled only when plugged in), and **Fit into bot** (a `workshop/guard` brick, unplugged, notes at every hook). `/workshop/armour` redirects to it; the rail entry is "Guards". The e2e lists all four services, tests Llama Guard on a fixture, fits it into a bot and plays the bot to its end card with "Guard asked" rows on the trace — on the quick snack card rather than `warning-sign`, whose unscripted Demo Brain run outlasts the e2e budget; `warning-sign` through the same stack is `pack-workshop`'s own unit test.

> **Amended 2026-09-02 (Stage D).** The baseline gained the two stacks (`local-llama-guard`, `azure-content-safety`), each `starter/safety` + `workshop/guard` unplugged, for every scenario; `campaigns/injection-baseline.json` is regenerated — 320 → 640 cells, the thirteen gates unchanged, every verdict unchanged. One mechanism was missing and is recorded: the campaign runner built its registry from the starter pack alone, so a stack naming `workshop/guard` and a service could not be fitted. `RunOptions.packs` (starter harness) and `RunCampaignOptions.packs` (evals) register extra packs beside the starter pack, skipping any already registered; `baselinePacks()` names what the baseline needs; the harness passes its whole configured list and the Campaigns page passes the app's `installedPacks`. Every count that named sixteen cells at one seed now names thirty-two.

> **Amended 2026-09-02 (Stage E — WP42 closed).** Against the row: both packs contain a service, a client, a reading, fixtures and strings and nothing else (read the diff: `packages/packs/azure-content-safety/src`, `packages/packs/guard-local/src`); both pass `checkGuardrailService` through `describeConformance`; the baseline names both as stacks and CI runs it offline under `--egress none`; the live checkpoint is recorded as not yet taken, with the shape that will take it; the Guard Rack e2e fits a service into a bot and runs it offline. The next-vendor test holds a third time: neither pack changed a line outside its own directory except its two registration lines.

> **Amended 2026-09-02 (Stage A).** Both packs landed as §3 describes and pass `describeConformance` with a `guardrailServices` fixture each; both are installed in the app (`packs.ts`) and the harness (`defaultPacks`). Three notes. **`GuardrailService.browserCapable?: boolean`** joined the contract (core, additive) so stage B has somewhere to write its answer: Model Armor `true` (WP35's checkpoint), Azure `false` until its checkpoint, the local pair `false` because Ollama answers a browser only when started with `OLLAMA_ORIGINS`. **The testkit's egress check compared `host` (with port) against declarations; core's `hostOf` reads the hostname**, which the local pack's `localhost:11434` exposed — the testkit now uses core's reader, and a declaration is a hostname. **Azure's config refuses an endpoint that is not `*.cognitiveservices.azure.com`** at the schema, so the egress declaration and the config cannot disagree. Gate: azure 12 tests, guard-local 12, testkit 32, `npm run check` and lint across 32 tasks.

---

## 8. Stages

| Stage | Builds | Definition of done |
|---|---|---|
| **A** | This note; both packs — services, clients, readings, fixtures, tests, conformance through `checkGuardrailService` | Both packs contain a service, a client, a reading, fixtures and strings and nothing else; both pass `describeConformance`; installed in the app and the harness |
| **B** | The live checkpoint for Azure — a real verdict, CORS go/no-go, latency — recorded as a dated note here and in `27-…`'s row; `browserCapable` set | Dated note with numbers, or a dated note saying why it could not be taken yet |
| **C** | The Guard Rack; `/workshop/armour` redirects; rail entry | The rack e2e fits a service into a bot and runs `warning-sign` offline through it |
| **D** | The baseline campaign gains both stacks; JSON regenerated; campaign e2e updated | CI's `--egress none` baseline still passes with the new cells |
| **E** | Close-out notes | `26-…` §12, `27-…` row and §8, `CLAUDE.md`, README |
