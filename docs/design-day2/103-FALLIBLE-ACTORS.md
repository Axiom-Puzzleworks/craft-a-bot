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
