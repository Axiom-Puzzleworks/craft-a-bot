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

| Store | Mechanism | Contents |
|---|---|---|
| `cab.agents` | IndexedDB object store | `AgentRecord` (the `AgentSpec` + shelf metadata) |
| `cab.runs` | IndexedDB object store | `RunRecord` (run summary) |
| `cab.events` | IndexedDB object store (indexed by `runId`, `seq`) | Trace events, append-only |
| `cab.settings` | `localStorage` (`cab.settings.v1`) | Preferences (sound, motion, speed), tutorial progress, badges |
| `cab.keys` | `localStorage` (`cab.keys.v1`) | `{ [providerId]: apiKey }` — see key rules |

IndexedDB via the `idb` wrapper; one database `craftabot`, versioned migrations from day one (`upgrade(db, oldVersion)` switch — even v1 ships as migration 1, so the pattern exists before it's needed).

Retention: traces are big; default cap 50 stored runs (LRU eviction with a friendly notice); "keep this run" pin exempts a run from eviction.

## 3. Entities

```ts
// Shelf item — wraps the spec from 02-AGENT-MODEL.md §6
export interface AgentRecord {
  id: string;                    // uuid (same as spec.id)
  spec: AgentSpec;
  boxArtSeed: string;            // deterministic generated box-art variation
  lastValidation: BuildProblem[];
  lastRunId?: string;
  createdAt: string; updatedAt: string;
  schemaVersion: 1;
}

export interface RunRecord {
  id: string;                    // uuid
  agentId: string;
  agentName: string;             // denormalised for display after agent deletion
  goalCardId: string;
  specSnapshot: AgentSpec;       // exact spec at run time — reproducibility (purpose 2)
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

## 4. The kit file (agent export/import)

Extension **`.craftabot.json`** (double extension keeps it obviously JSON). Shape:

```jsonc
{
  "format": "craftabot-kit",
  "formatVersion": 1,
  "exportedAt": "2026-08-12T10:00:00Z",
  "exportedBy": "craftabot-workbench/1.0.0",
  "requires": { "core": ">=1.0.0", "packs": { "starter": ">=1.0.0", "openai": ">=1.0.0" } },
  "agent": { /* AgentSpec — verbatim */ },
  "notes": "Optional free text from the exporter"
}
```

Rules:

- **Never contains:** API keys, run history, user identity. A kit file is safe to share publicly by construction.
- Import validates with Zod → checks `requires` against installed packs → regenerates `id` if it collides (imported bots are copies, "traded" like real kits — the friendly frame for sharing).
- Unknown extra fields are preserved on round-trip (forward compatibility, `passthrough()` in Zod).
- `formatVersion` bumps only on breaking shape changes; additive fields don't bump.

## 5. Trace export

Extension **`.craftabot-trace.json`**: `{ format: "craftabot-trace", formatVersion: 1, run: RunRecord, events: EngineEvent[], traceDigest: string }` — `traceDigest` is the SHA-256 of the ordered event array (integrity check, per `08-GOVERNANCE-GUARDRAILS.md` §4).

- Ordered by `seq`; includes the `specSnapshot` and `packVersions`, so a trace is a **self-contained, reproducible record of a run** — the governance artefact (purpose 2). An exported trace + the same pack versions = enough to replay or audit a run.
- Redaction pass before export strips nothing in V1 *except* a defence-in-depth scrub: any string equal to a stored key is replaced with `"[key-redacted]"` (belt-and-braces beyond the "keys never enter events" rule, and the subject of the CI test in `06-LLM-PROVIDERS.md` §6).

## 6. Zod schema organisation

- All schemas in `@craftabot/core` under `src/schemas/` (`agentSpec.ts`, `kitFile.ts`, `traceFile.ts`, `events.ts`, `packManifest.ts`); types derived via `z.infer` — **schemas are the single source of truth** for both runtime validation and TS types.
- Each schema exports `parseX` (throwing) and `safeParseX` helpers; storage/import code uses only `safeParse` + structured error reporting.
- Migration functions colocated: `migrateKitFile(unknown) → latest | MigrationError`, table-driven by `formatVersion`, unit-tested with a fixture file per historical version (fixtures start accumulating now, at v1).

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
