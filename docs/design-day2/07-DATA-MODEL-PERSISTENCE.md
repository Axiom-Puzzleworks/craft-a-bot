> **DESIGN DAY 2 STATUS (2026-08-13):** Carried forward as the V1.0 baseline. Schema evolutions (trace migrations, RunRecord audit fields, AgentSpec v2) are specified in `14-BRICK-REFERENCE-DESIGNS.md` §7.
> This file is a verbatim copy of `docs/design/07-DATA-MODEL-PERSISTENCE.md` carried into the standalone Day 2 set; only this banner has been added.

# 07 — Data Model & Persistence

> What gets stored, where, and in what shape: local-first storage, the kit file format, trace persistence, and the pre-planned path to Supabase.
> Prerequisite reading: `01-ARCHITECTURE.md`, `02-AGENT-MODEL.md`.

---

## 1. Principles

1. **Local-first:** the browser is the source of truth in V1. No accounts, no sync, no server.
2. **Sync-ready shapes:** every entity has a UUID `id`, `createdAt`/`updatedAt` ISO timestamps, and a `schemaVersion` — so a future Supabase sync is additive, not surgery.
3. **Human-readable exports:** kit files and trace exports are pretty-printed JSON a curious user can open and learn from. Exports are part of the teaching surface.
4. **Secrets are not data:** API keys live in their own storage slot and never appear in any entity, export, or event (`06-LLM-PROVIDERS.md` §6).
5. **Validated at every boundary:** everything read from storage or imported from a file passes Zod schemas; invalid data degrades gracefully (quarantined, never crashes the app).

## 2. Storage map (V1)

> **Amended 2026-09-02 (WP41, `26-…` §6.11):** a `cab.keys.v1` entry is either the bare secret string it always was or `{ secret, expiresAt? }` for a timed credential (an OAuth token's epoch-ms expiry). The bare shape is read unchanged and is still what an untimed key is written as; only a timed entry takes the object form. `KeyVault.get` returns the secret either way; `KeyVault.expiry(id)` returns the expiry; `secrets()` sweeps both shapes, so the key-leak tests cover a timed entry exactly as before.

| Store | Mechanism | Contents |
|---|---|---|
| `cab.agents` | IndexedDB object store | `AgentRecord` (the `AgentSpec` + shelf metadata) |
| `cab.runs` | IndexedDB object store | `RunRecord` (run summary) |
| `cab.groupRuns` | IndexedDB object store | `GroupRunRecord` (a multi-agent episode's own summary — WP29) |
| `cab.events` | IndexedDB object store (indexed by `runId`, `seq`) | Trace events, append-only — a group episode's merged stream stores here too, keyed by its own `groupRunId` |
| `cab.runSummaries` | IndexedDB object store (keyed by `runId`, `DATABASE_VERSION` 3) | `RunSummary` — a finished run's folded facts (WP36 stage C); a cache of the trace, never authored; gone with its run |
| `cab.campaigns` | IndexedDB object store (keyed by `id`, `DATABASE_VERSION` 4) | `StoredCampaignReport` — a campaign report's envelope with the report opaque inside (WP38 stage D, `28-…` §4.9); outside the run cap; the harness keeps the same rows at `campaigns/<id>.json` |
| `cab.evaluations` | IndexedDB object store (keyed by `id`, indexed by `runId`, `DATABASE_VERSION` 5) | `EvaluationRecord` — one evaluator's verdict over one run (WP43, `31-…` §4.1); deleted with its run; the harness keeps the same rows at `runs/<runId>/evaluations.jsonl` |
| `cab.settings` | `localStorage` (`cab.settings.v1`) | Preferences (sound, motion, speed), tutorial progress, badges |
| `cab.keys` | `localStorage` (`cab.keys.v1`) | `{ [providerId]: apiKey }` — see key rules |

IndexedDB via the `idb` wrapper; one database `craftabot`, versioned migrations from day one (`upgrade(db, oldVersion)` switch — even v1 ships as migration 1, so the pattern exists before it's needed).

Retention: traces are big; default cap 50 stored runs (LRU eviction with a friendly notice); "keep this run" pin exempts a run from eviction.

> **Amended 2026-09-02 (WP36 stage C):** the cap is a preference now — `settings.runCap` in `cab.settings.v1`, 5–500, default 50, offered only while the Workshop door is open — and both Play routes pass it to `evictOldRuns`. A row written before the field existed reads as 50. Grouped runs stay outside the cap (WP31's rule, unchanged).

## 3. Entities

> **Amended 2026-08-13 (WP14 slice 2c):** `AgentRecord` is at `schemaVersion: 2` — it holds `AgentSpec` v2, and `boxArtSeed` has moved onto `spec.identity` where `14-…` §2.2 puts identity. The seed on the row never travelled inside a kit file, so an exported bot arrived somewhere else wearing a different box; the record migration is what carries each existing bot's seed across. Storage **migrates rows on read** (see §6), because a shelf full of v1 rows is the normal state of anyone who used V1.0.

```ts
// Shelf item — wraps the spec from 02-AGENT-MODEL.md §6
export interface AgentRecord {
  id: string;                    // uuid (same as spec.id)
  spec: AgentSpecV2;             // identity, including boxArtSeed, lives on the spec
  lastValidation: BuildProblem[];
  lastRunId?: string;
  createdAt: string; updatedAt: string;
  schemaVersion: 2;
}

export interface RunRecord {
  id: string;                    // uuid
  agentId: string;
  agentName: string;             // denormalised for display after agent deletion
  goalCardId: string;
  specSnapshot: AgentSpec | AgentSpecV2;  // exact spec at run time — reproducibility (purpose 2)
  packVersions: Record<string, string>;  // e.g. { starter: "1.0.0", openai: "1.0.2" }
  mode: 'step' | 'play';
  outcome: 'SUCCESS' | 'OUT_OF_STEPS' | 'STOPPED_BY_USER' | 'STOPPED_BY_GUARDRAIL' | 'ERROR' | 'IN_PROGRESS';
  ticks: number;
  usage: { inputTokens: number; outputTokens: number };
  pinned: boolean;
  startedAt: string; finishedAt?: string;
  schemaVersion: 1;
}

export interface StoredEvent {                 // one row per engine event
  runId: string;
  seq: number;                   // monotonic per run — ordering guarantee
  event: EngineEvent;            // typed union from 02-AGENT-MODEL.md §7
}
```

> **Amended 2026-08-19 (WP29 stage F, `23-MULTI-AGENT-DESIGN.md` §4.7):** a group episode's own row, `GroupRunRecord`, in its own store (`cab.groupRuns`, `DATABASE_VERSION` 2) — not folded into `cab.runs`, because a group has no single `specSnapshot` or `providerId` to denormalise and mixing the two row shapes in one store would have made every reader guess which kind it had. `RunRecord` gains one optional field, `groupRunId?: string`, carrying a member back to its episode — additive, no `schemaVersion` bump, the same widening policy `providerId`/`wireModel`/`budgets` (E8) already followed. The merged stream needs no new storage concept at all: it is `appendEvents`/`getEvents` against the group's own id, exactly as a solo run's events are, because `StoredEvent.seq` is assigned in append order regardless of whose events they are.
>
> ```ts
> export interface GroupRunRecord {
>   id: string;                    // uuid — the group's own groupRunId
>   goalCardId: string;
>   memberRunIds: string[];
>   memberAgentIds: string[];
>   outcome: RunOutcome | 'IN_PROGRESS';
>   rounds: number;
>   usage: { inputTokens: number; outputTokens: number };
>   pinned: boolean;
>   startedAt: string; finishedAt?: string;
>   schemaVersion: 1;
> }
> ```
>
> Retention (§2's LRU cap) stays run-scoped for now: `evictOldRuns` was not extended to cap group episodes, a deliberate simplification recorded rather than silently left unbounded (`23-…` §8) — there is no live producer of episodes yet (WP31's job), so capping them is a decision worth making against real usage rather than guessed at here.

## 4. The kit file (agent export/import)

Extension **`.craftabot.json`** (double extension keeps it obviously JSON). Shape:

```jsonc
{
  "format": "craftabot-kit",
  "formatVersion": 2,
  "exportedAt": "2026-08-12T10:00:00Z",
  "exportedBy": "craftabot-workbench/1.0.0",
  "requires": {
    "core": ">=1.0.0",
    "packs": { "starter": ">=1.0.0", "openai": ">=1.0.0" },
    // kind id → the pack that provides it, read from the registry (`14-…` §2.4)
    "brickKinds": { "starter/llm": "starter", "starter/safety": "starter" }
  },
  "agent": { /* AgentSpec v2 — verbatim */ },
  "notes": "Optional free text from the exporter"
}
```

> **Amended 2026-08-13 (WP14 slice 2c):** `formatVersion: 2` — the kit embeds spec v2 and gains `requires.brickKinds`. v1 could only name the *packs* a bot needed, which was enough while the six bricks were baked into the schema; once a pack can add a seventh, "you need the starter pack" is no answer to someone who has it at a version without the brick. Rationale and the packs-then-bricks check order are in `14-…` §2.4.

Rules:

- **Never contains:** API keys, run history, user identity. A kit file is safe to share publicly by construction.
- Import validates with Zod → checks `requires` against installed packs, **then against installed brick kinds** → regenerates `id` if it collides (imported bots are copies, "traded" like real kits — the friendly frame for sharing).
- Unknown extra fields are preserved on round-trip (forward compatibility, `passthrough()` in Zod).
- `formatVersion` bumps only on breaking shape changes; additive fields don't bump.

## 5. Trace export

Extension **`.craftabot-trace.json`**: `{ format: "craftabot-trace", formatVersion: 1, run: RunRecord, events: EngineEvent[], traceDigest: string }` — `traceDigest` is the SHA-256 of the ordered event array (integrity check, per `08-GOVERNANCE-GUARDRAILS.md` §4).

- Ordered by `seq`; includes the `specSnapshot` and `packVersions`, so a trace is a **self-contained, reproducible record of a run** — the governance artefact (purpose 2). An exported trace + the same pack versions = enough to replay or audit a run.
- Redaction pass before export strips nothing in V1 *except* a defence-in-depth scrub: any string equal to a stored key is replaced with `"[key-redacted]"` (belt-and-braces beyond the "keys never enter events" rule, and the subject of the CI test in `06-LLM-PROVIDERS.md` §6).

> **Amended 2026-08-19 (WP29):** stays single-run. A group episode's merged trace has no export format of its own in WP29 — `buildTraceFile` was not extended to accept a `GroupRunRecord`, and a bundle format (N member traces + the merge + a digest over the whole) is real, undecided work deferred to WP34's audit centre (`23-MULTI-AGENT-DESIGN.md` §4.7). A group's Run Lab accordingly shows no digest badge and no "Open in Kit" link; each member's own trace exports exactly as any solo run's does.
>
> **Amended 2026-08-21 (WP34):** still stays single-run — WP34's own Audit Centre (`17-…` §4.10) picks from `storage.listRuns()` alone, the same solo `RunRecord` list the Run Browser's ungrouped rows use, so a `GroupRunRecord` never appears in its picker and a group member picked individually exports only its own trace, not the merged episode. The bundle format this note originally deferred to WP34 is still undecided and now has no WP named for it at all — recorded here rather than left silently pointing at a phase that has since closed without it.

## 6. Zod schema organisation

- All schemas in `@craftabot/core` under `src/schemas/` (`agentSpec.ts`, `kitFile.ts`, `traceFile.ts`, `events.ts`, `packManifest.ts`); types derived via `z.infer` — **schemas are the single source of truth** for both runtime validation and TS types.
- Each schema exports `parseX` (throwing) and `safeParseX` helpers; storage/import code uses only `safeParse` + structured error reporting.
- Migration functions colocated: `migrateKitFile(unknown) → latest | MigrationError`, table-driven by `formatVersion`, unit-tested with a fixture file per historical version (fixtures start accumulating now, at v1).

> **Amended 2026-08-13 (WP14 slice 2c):** four artefacts now migrate this way — `migrateKitFile`, `migrateAgentSpec`, `migrateAgentRecord` and `migrateTraceFile` — sharing one `MigrationError` shape but keeping their own user-facing wording, because a kit and a bot are different things to a reader. **Stored rows migrate on read, not on parse.** `storage.listAgents()` and `getAgent()` call `migrateAgentRecord`; `putAgent` still takes the current version only, so nothing can write an old row back. Quarantine (§1.5, §8) is for rows that are genuinely unreadable, not merely old.

## 7. Future Supabase mapping (design note only — do not build)

When sharing/community features arrive:

| Local | Supabase |
|---|---|
| `cab.agents` | `agents` table (`id uuid pk`, `owner uuid`, `spec jsonb`, timestamps) + RLS `owner = auth.uid()` |
| `cab.runs` / `cab.events` | `runs` + `run_events` (partitioned by run) — likely opt-in upload ("publish this trace") rather than auto-sync |
| Kit sharing | `published_kits` (kit-file JSON + metadata), public-readable — the kit file format above is already the wire format |
| `cab.keys` | **Never synced.** |

Conflict policy for future sync: last-write-wins on `updatedAt` per whole entity (specs are small; no field-level merge). Local IDs are UUIDs precisely so records upload without re-keying.

## 8. Storage failure & quota behaviour

- IndexedDB unavailable (private browsing, corp lockdown): app runs fully in-memory; a shelf banner explains nothing will survive a reload; export buttons become the hero path.
- Quota pressure: on write failure, evict unpinned traces oldest-first, retry once, then surface the storage notice (`03-UI-UX-DESIGN.md` §9).
- All persistence behind a thin `Storage` interface in the app (`lib/state/storage.ts`) so tests run against an in-memory implementation and the future Supabase adapter has a seam.

> **Amended 2026-09-02 (WP36 stage A, `26-TARGET-DESIGN-V3.md` §6.7):** the `Storage` interface, its helpers (`DEFAULT_RUN_CAP`, `selectRunsToEvict`, `byNewestFirst`, `emptyQuarantine`) and `createMemoryStorage` now live in `@craftabot/core` (`packages/core/src/storage/`), exported from the main barrel; the conformance suite every implementation must pass, `describeStorageContract`, and its fixtures live on `@craftabot/core/testing`. The reason is the one this bullet already gives — a seam — drawn one layer further out: a headless host (`27-DAY3-ROADMAP.md` WP37) has to store runs against the same contract the browser does. The IndexedDB implementation stays in the app, because IndexedDB is a browser API (hard rule 1); `apps/workbench/src/lib/state/storage*.ts` keep the old import paths alive as re-exports for one release.
