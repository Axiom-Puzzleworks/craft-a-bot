# 34 — The Workshop content store (WP46)

> **Status:** design of record for WP46 (`27-DAY3-ROADMAP.md` Phase J, its last row), written 2026-09-02 against the codebase after WP45. This is the map for `26-TARGET-DESIGN-V3.md` §6.10; where the two differ, §7 below says why and `26-…` §12 gets a dated note when the stage lands.

---

## 1. Purpose

Everything a person authors in the Workshop evaporates when the tab closes: the Policy Studio's card (its own doc comment says "nothing authored here is saved yet"), a corpus imported into the Scenario Library, the campaign JSON edited on the Campaigns page, and the Test Bench has no way to add a card at all. `17-…` §4.5 recorded the gap with its reasons — a content store shared between modes has id-collision and versioning questions of its own. WP46 answers them: one store, one reserved pack id, ids that cannot collide with anything shipped, and kit files that carry the cards they need so an import on a machine that never saw them still works.

---

## 2. Where the code actually is

**`packages/core/src/storage/storage.ts`** — the `Storage` contract with agents, runs, events, group runs, summaries, campaign reports and evaluations; three implementations (`core/storage/memory.ts`, `apps/workbench/src/lib/state/storage-idb.ts` at database version 5, `packages/harness/src/storage/file-storage.ts`) and one shared suite (`core/testing/storage-contract.ts`). **`core/src/pack-registry.ts`** — `registerPack` with `insertUnique` per content kind; nothing reserves an id. **`core/src/schemas/kit-file.ts`** — `requires { core, packs, brickKinds }`; **`core/src/persistence/kit-export.ts`** — `buildKitFile`, `importKitFile` (missing packs, missing bricks, colliding agent id → fresh id). **`apps/workbench/src/lib/packs.ts`** — `installedPacks` and a synchronous `createRegistry()` called from many screens. **`routes/bench/[agentId]`** — `policyCards = registry.listPolicyCards()` handed to the leaflet; **`components/bench/PartsTray.svelte`** — the `audience` gate on `preferences.workshop`. **`routes/workshop/policies`** — the draft card and its JSON view; **`routes/workshop/bench`** — `testBenchCards(registry)`; **`routes/workshop/scenarios`** — session-only imports (WP44); **`routes/workshop/campaigns`** — the campaign JSON editor. **`packages/harness/src/config.ts`** — `HarnessConfig { packs }`, `createRegistry(config)`.

---

## 3. Design principles

1. **One reserved pack, `local`.** Every authored thing has an id under `local/<kind>/<slug>`; no shipped pack may use the prefix, and the registry refuses one that tries.
2. **Content, not mechanism.** The local pack is a synthetic `PackManifest` built from records — the registry, the pickers and the harness see an ordinary pack.
3. **A kit file carries what only this machine has.** A `local/*` card fitted on a bot is embedded in `requires.localContent`; import rebuilds it under a fresh id and rewrites the reference — imported things are copies, as kit files already say.
4. **The door stays shut in the Kit.** `local/*` cards are offered on the Kit bench only while the Workshop preference is on — the same `audience` gate, applied to content.
5. **The three stores agree.** Content joins the `Storage` contract and its shared suite; the harness reads a `content/` directory into the same pack.

---

## 4. The design

### 4.1 The record and the local pack (core, stage A)

`schemas/content.ts`: `LOCAL_PACK_ID = 'local'`; `ContentRecord { id: 'local/<kind>/<slug>', kind: 'policy-card' | 'assertion-card' | 'scenario' | 'campaign', title, record, savedAt, schemaVersion: 1 }` where `record` is validated against the kind's own schema for the three core kinds and kept opaque for a campaign (its schema lives in `evals`). `localContentId(kind, slug)`, `slugOf(title)`, `isLocalId(id)`. `localPackFrom(records): PackManifest` — id `local`, the three card kinds on their manifest fields, campaigns left out (they are not pack content; the Campaigns page lists them). `registerPack` refuses any pack other than `local` whose cards, scenarios or goal cards carry a `local/` id.

### 4.2 Storage (core, workbench, harness — stage A)

`putContent / getContent / listContent(kind?) / deleteContent` on the contract; memory as a map; IndexedDB version 6 with a `content` store keyed by id and indexed by kind; the file store under `content/<kind>/<slug>.json`. The shared suite gains a section; `clear()` clears it.

### 4.3 Kit files (core, stage A)

`requires.localContent?: ContentRecord[]` — optional, so every existing kit file still parses. `localContentReferencedBy(spec)` finds `local/*` ids in any fitted brick's `policyCards`; `buildKitFile` takes `localContent` and embeds the records; `importKitFile` mints `local/<kind>/<slug>-<6 chars of newId()>` for each embedded record, rewrites the references in the spec, and returns `imported.localContent` for the host to store; a `local/*` reference with no embedded record is a `missing-local-content` problem.

### 4.4 The app (workbench, stage B)

`lib/state/content.svelte.ts` — the records, loaded from storage at Workshop start and after every save, and `createRegistry()` registers `localPackFrom(records)` beside the installed packs. Save on four screens: the Policy Studio (the draft under `local/policy/<slug>`), the Test Bench (a card pasted as JSON), the Scenario Library (an imported corpus's scenarios, each under `local/scenarios/<slug>`), the Campaigns page (the edited campaign). A "Your content" section on each lists and deletes. The Kit bench filters `local/*` policy cards on `preferences.workshop`; the Spec Lab reads them back through the same registry. Export embeds; import stores what came back.

### 4.5 The harness (stage C)

`--content <dir>` (default `./content`) on every command: the directory's `<kind>/<slug>.json` records become the local pack in `createRegistry(config)`; `craftabot content list` and `craftabot content add --file <record.json>`.

---

## 5. Non-goals

Versioning authored content (a record is replaced on save; the kit file is the copy). Editing shipped cards (a copy under `local/` is the way). Sharing content between browsers other than through kit files.

---

## 6. Stages

| Stage | Builds | DoD |
|---|---|---|
| **A** | This note; the record and the local pack; content on the three stores; the registry guard; `requires.localContent` | The shared suite passes on all three; a shipped pack with a `local/` id is refused; a kit file carrying a `local/*` card imports on a registry that never saw it, under a fresh id, with the spec rewritten |
| **B** | Content state and the registry in the app; save on the four screens; the Kit's gated picker; export/import wired | A card authored in the Studio is picked on the Kit bench (door open), fitted, runs, reads back in the Spec Lab (e2e); the leaflet coverage test unchanged |
| **C** | `--content` in the harness, `craftabot content`; close-out | A harness campaign names a `local/*` policy card from `content/`; notes in §7, `26-…` §12, `27-…`, `CLAUDE.md`, README, `17-…` §4.5 |

---

## 7. Divergences from `26-…` §6.10

- **D-a — campaigns are stored but not pack content**: §6.10 lists `Campaign` among the record kinds; the registry has no campaign field and `core` cannot import the campaign schema, so a campaign record is opaque in the store and listed by the Campaigns page only.
- **D-b — only policy cards ride in kit files**: `requires.localContent` embeds what a bot's spec references, and a spec references policy cards; assertion cards, scenarios and campaigns are not fitted on a bot.

Stage notes are appended below.

> **Amended 2026-09-02 (stage A done).** As §4.1–4.3. `ContentRecord`'s envelope carries the kind and the title beside the record so a list never parses the inside; `superRefine` checks the id's segment against the kind, the inner card against its own schema, and that the inner id equals the envelope's. `contentRecordFor(kind, card, { slug?, savedAt })` is the one way a screen wraps a card. The registry guard covers policy cards, assertion cards, scenarios and goal cards. The file store's layout is `content/<segment>/<slug>.json` and `readContentDir` is exported for the harness's `--content` directory, which is the same layout outside a store. On import the fresh id is the embedded id plus six characters of `newId()`; the record's `savedAt` becomes import time. Tests: `core/schemas/content.test.ts` (records, the local pack, the guard, the kit round trip and its refusal), the shared storage suite's `content` section on all three stores (IndexedDB at version 6).

> **Amended 2026-09-02 (stage B done).** As §4.4. `contentStore` (`lib/state/content.svelte.ts`) is loaded from the root layout; `createRegistry()` registers its `localPack`, and the bench store, the Studio, the Test Bench and the Scenario Library rebuild their registries from it (`$derived` on the records), so a save is visible everywhere without a reload. The Kit filters `local/*` policy cards on `preferences.workshop`; the Studio's save keeps the local id on re-save (the id field turns into the local id after the first save, so the next save replaces); the Test Bench takes a card as pasted JSON and mints the id from the title; the Scenario Library saves an imported corpus's scenarios under `local/scenarios/<pack>-<row>`; the Campaigns page saves the editor's JSON under `local/campaigns/<campaign id>` and loads it back. Export embeds the referenced records; import stores what came back before the bot itself. Proven by `content.spec.ts` (the Studio → Kit → Playroom → Spec Lab round trip with the door open; the same card absent from the Kit's picker with the door shut) and `content.svelte.test.ts`; the leaflet coverage test is unchanged.

> **Amended 2026-09-02 (stage C — WP46 closed; Phase J closed).** As §4.5. `--content <dir>` (default `./content`) on every harness command, read by `configFrom` into `HarnessConfig.content`; `createRegistry(config)` registers the local pack always (empty or not) so `local/*` resolves the same way in the app and the harness; the campaign command hands the local pack to the runner beside the config's packs (the runner skips what its registry already has). `craftabot content list` and `content add --file <record.json>`. Proven by `harness/commands/content.test.ts`, whose campaign fits `local/policy/no-shouting` from a `--content` directory and runs. `17-…` §4.5's WP22 note now points here. `27-…` §8 item 15 carries the gate.
