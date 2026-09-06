# 58 — The shared evidence store (WP70)

> **Status:** design of record for WP70 (Phase P; `42-DAY4-ROADMAP.md` §3, `41-TARGET-DESIGN-V4.md` §6.11, decision D1; retires G29). Written 2026-09-06 on branch `wp70-evidence-store`, before stage A. The roadmap row names this note `49-EVIDENCE-STORE.md`; notes are numbered in the order they are written, so it is `58-` (§8).

## 1. Purpose

Everything the product makes is local-first: a run lives in the browser's store or in a directory of files, a bundle travels as a file, a campaign report as a file, an assurance pack as one HTML file a reviewer opens with no app. Sharing any of it is a person attaching a file to a message. `41-…` §6.11 (decision D1) adds the one capability that cannot be local-first — a place two machines both reach — and adds it in the narrowest form that is still useful: **a sync target for artefacts only**. Never for keys. Never for the source of truth. Never required.

This note fixes what the store holds and what it may never hold, the contract every store implements, the one adapter (Supabase, as `01-…` §6 pre-decided), the harness commands, the Workshop screen, and what proves it.

## 2. Where the code actually is — and what the contract test found

Read before writing: `core/src/types/trace-sink.ts` and `brick.ts` (the credential shape), `harness/src/sinks.ts`, `pack-testkit/src/checks/sink.ts`, the Workshop's `lib/state/sinks.svelte.ts` and `/workshop/sinks`, the export and campaigns pages, `lib/workshop/bundles.ts`, `harness/src/commands/export.ts` and `key-leak.test.ts`, the registry's `serviceLines` pattern, the four artefact schemas and `docs/geap-setup.md`.

1. **The sink is the precedent, and it is not pack content.** `TraceSink` lives in `core` (`types/trace-sink.ts`) so the testkit and both hosts can name it without depending on `@craftabot/telemetry`, which implements it; the hosts list sinks by hand (`harnessSinks`, `browserSinks`) and no manifest carries one. D1 asks for `PackManifest.evidenceStores?`, which is the other shape — a store as registered content, like a service line. **Fixed:** the contract (`EvidenceStore`, `EvidenceItem`, `EvidenceReceipt`, `describeEvidenceStoreProblems`, the item digest) lives in `core` beside the sink's, exactly as the sink's does and for the same reason; the manifest gains `evidenceStores?` and the registry `getEvidenceStore`/`listEvidenceStores`; `@craftabot/evidence` holds the stores and a manifest (`evidence`) that both hosts list. §8 records the divergence from "new package (core only)".
2. **Each artefact digests differently.** A bundle's `bundleDigest` is over the digests inside it; an assurance pack's `digest` is over its canonical JSON less `digest` and `generatedAt`; a stored campaign report is an envelope with no digest at all; a content record has none. A store that verified "the artefact's own digest" would need four rules and have none for two kinds. **Fixed:** the item's digest is one rule for every kind — SHA-256 over the canonical JSON (`canonicalJson`, keys sorted) of the payload as pushed — computed by `computeEvidenceDigest` and checked by `verifyEvidenceItem`. A pulled bundle is then *also* verified by `verifyBundleDigest` on import, exactly as a bundle file is; the item digest says "what came back is what was pushed", the bundle digest says "what was pushed was sound".
3. **A sink never rejects; a store cannot say that.** `push` returns a receipt — there is no `{ ok: false }` a caller could act on that is not an error. **Decided:** `push` and `pull` reject on failure with a message that never carries the credential (the conformance check plants one and reads the message); `verify` resolves `false` for a missing or changed item and rejects only when the store cannot be reached. A host shows the rejection on the screen or the command line; the run never hears — the store is never on the run's path.
4. **The credential shape is one string per id.** `BrickKindDefinition['credential']` names one secret; D1 names two things — the project's anon key and a workspace token. **Decided:** the workspace token is the credential (`evidence-supabase`, kind `bearer-token`, sent as `Authorization: Bearer …`); the anon key is configuration (`anonKey`, sent as `apikey`), which Supabase designs to be publishable and which RLS, not secrecy, guards. Both are planted in the key-leak sweep all the same (§4.4), and neither is ever written to a trace, a log, a URL or an error.
5. **The egress guard already does the network policy.** `buildSink` and the Workshop's sinks store build a sink behind `createEgressGuard` with the sink's own `egress(config)` allowed. **Reused unchanged:** a store is built the same way; `--egress none` in CI refuses it and the command reports the refusal.
6. **The Run Browser already verifies on import.** `bundleForRun`/`exportForGroup` build bundles, and the import path verifies `bundleDigest` before storing. **Reused:** a pulled bundle goes through the same path — the pull is an import whose file arrived over the network.
7. **The Workshop's credential compartments are per provider.** Settings shows a compartment per battery kind (`battery-compartment-<id>`) plus the geap token's. **Fixed (stage C):** a compartment for the store's token, on the same component, from the store's `credential` declaration.

## 3. Principles

- **Artefacts only, and only these four.** `TraceBundle`, `StoredCampaignReport` (the envelope the store keeps), the assurance pack record, and `ContentRecord` (`local/*`). Nothing else has an item kind, and adding one is a `core` change.
- **Never: a key, a token, a raw provider response outside a bundle, a case file outside a bundle, a run that is not a bundle, a kit file, a preference.** The contract cannot express them; the item union is closed.
- **Never the source of truth.** Every artefact exists locally first; the store holds copies; nothing reads the store to decide anything. Deleting the project loses nothing a person did not also delete locally.
- **Never required.** Unconfigured, every screen and command behaves exactly as before; every e2e runs with it unconfigured.
- **The digest travels with the item** and is checked on every pull. A store that cannot verify is not a store.
- **A workspace is a token, not an account.** No sign-in, no user table, no presence. Provisioning is the team's job; `docs/evidence-setup.md` says how.

## 4. Design

### 4.1 The contract (`core/src/types/evidence-store.ts`, `core/src/schemas/evidence.ts`)

```ts
type EvidenceKind = 'bundle' | 'campaign-report' | 'assurance-pack' | 'content';
interface EvidenceItemBase { id: string; digest: string; pushedAt: string; pushedBy?: string; }
type EvidenceItem =
  | (EvidenceItemBase & { kind: 'bundle'; payload: TraceBundle })
  | (EvidenceItemBase & { kind: 'campaign-report'; payload: StoredCampaignReport })
  | (EvidenceItemBase & { kind: 'assurance-pack'; payload: Record<string, unknown> })
  | (EvidenceItemBase & { kind: 'content'; payload: ContentRecord });
interface EvidenceReceipt { storeId: string; workspace: string; kind: EvidenceKind; id: string; digest: string; storedAt: string; }
interface EvidenceQuery { kind?: EvidenceKind; id?: string; since?: string; limit?: number; }
interface EvidenceStoreInstance {
  push(item: EvidenceItem): Promise<EvidenceReceipt>;
  pull(query: EvidenceQuery): AsyncIterable<EvidenceItem>;
  verify(receipt: EvidenceReceipt): Promise<boolean>;
}
interface EvidenceStore {
  id: string; name: string; description: string;
  credential?: BrickKindDefinition['credential'];
  egress(config: unknown): EgressDeclaration[];
  configSchema: z.ZodType<unknown>;
  create(options: { config; fetch; getCredential; now? }): EvidenceStoreInstance;
}
```

`evidenceItemSchema` (Zod, the union) validates on the way out of a store; `computeEvidenceDigest(payload)` and `verifyEvidenceItem(item)` are the one digest rule (§2 item 2); `evidenceItemFor(kind, id, payload, { now, principal })` builds an item; `describeEvidenceStoreProblems(store)` is the registry's shape check. The assurance-pack payload is the pack record as `governance/reports` builds it — `core` cannot name that type (the same reason the campaign report is an envelope), so the item carries it opaque and the reader in `governance` parses it.

The ids: a bundle's item id is its first run's id (a group's, the group id); a campaign report's is the stored report's id; an assurance pack's is `assurance/<bot.id>/<generatedAt>`; content's is the record's `local/…` id. Pushing the same id again replaces the row (an upsert) — the receipt's digest says which version is there.

### 4.2 The package (`packages/evidence`)

`@craftabot/evidence`, depending on `core` and `zod` only. Exports `memoryEvidenceStore` (`evidence/memory`: a map per kind per workspace, for tests and for a host that wants to see the flow with no project), `supabaseEvidenceStore` (`evidence/supabase`, §4.3), `browserEvidenceStores` and the manifest `evidencePack` (`{ id: 'evidence', evidenceStores: [supabaseEvidenceStore] }`) that both hosts list. `describeEvidenceStoreConformance` in the testkit runs the suite over both.

### 4.3 The Supabase adapter (`evidence/supabase`)

PostgREST over `fetch`; no client library (nothing to audit for what it logs). Config `{ url, anonKey, workspace }`; egress the host of `url`; credential `evidence-supabase` (`bearer-token`). Four tables, `evidence_bundles`, `evidence_campaign_reports`, `evidence_assurance_packs`, `evidence_content`, each `(workspace text, id text, digest text, pushed_at timestamptz, pushed_by text, payload jsonb, primary key (workspace, id))`, with row-level security on: a row is readable and writable only when `workspace = (auth.jwt() ->> 'workspace')`. The workspace token is a JWT signed with the project's JWT secret carrying `role: authenticated`, `workspace` and `exp` — minted by the team from `docs/evidence-setup.md`'s snippet, never by the app. `push` upserts (`Prefer: resolution=merge-duplicates`), `pull` selects by `workspace`, `kind` (the table), `id`, `pushed_at > since`, ordered by `pushed_at` then `id`, paged by `limit`; `verify` selects the digest only. A non-2xx response rejects with the status and PostgREST's `message` — never the request's headers.

The adapter's own test runs the whole flow against a fake PostgREST in memory (the request shapes are the thing to prove); the conformance suite against `supabase start` runs when `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`CRAFTABOT_CREDENTIAL_EVIDENCE_SUPABASE` are set and is skipped otherwise — CI has no CLI and skips it; the live checkpoint is recorded below when taken.

### 4.4 The harness — `craftabot evidence push|pull`

`craftabot evidence push --store evidence/supabase --store-config '<json>' --run <id> | --campaign-report <id> | --assurance <file> | --content <file>` builds the item from the file store (a run becomes its bundle by `buildTraceBundle`; a group by its group id), pushes it behind the egress guard and prints the receipt as JSON. `craftabot evidence pull --store … [--kind …] [--id …] [--since …]` pulls, verifies every item's digest, refuses one that fails, and writes bundles into the store as `craftabot import` would (a run record and its events), reports and content as files under `--out`. The credential comes from `CRAFTABOT_CREDENTIAL_EVIDENCE_SUPABASE`. The key-leak sweep plants the token and the anon key and sweeps every file the harness wrote and everything it printed.

### 4.5 The Workshop

`/workshop/evidence` (rail entry *Evidence*, between *Sinks* and *Playground*): one card per registered store with its config as JSON (the sinks screen's shape), the compartment's state (a lamp: token present or not), a *Push* row (a run, a campaign report, the assurance pack, a content record — each a picker over the local store) with the receipt shown, and a *Pull* row (kind, since) listing what came back with its verified digest, each importable into the local store — a bundle through the Run Browser's own import path. The Audit Centre gains *Push to evidence store* beside its download; Campaigns gains it on a saved report. Both are hidden when no store is configured. The store's configurations live in `cab.evidence.v1`; the token in the vault (`cab.keys.v1`) under `evidence-supabase`, with a compartment in Settings.

## 5. UX

The Workshop only — the Kit never sees a store. Toy names: the compartment is a *battery*, the store is the *evidence store*; the code says `EvidenceStore`, `credential`, `workspace`. A push reports its receipt in one line (*Pushed bundle run-… — digest a1b2…*); a failure reports the message the store gave, never a header. A pull lists items with a lamp per digest (*verified*/*failed*); a failed item cannot be imported.

## 6. Determinism

The store is outside every run and every campaign. A digest is a pure function of the payload; `pushedAt` comes from `now` (injected; the harness's clock or the browser's) and is not covered by the digest. The memory store is deterministic; the adapter's fake PostgREST is. Nothing in `core`, `evals` or `governance` changes behaviour because a store exists.

## 7. Non-goals

No sharing of bots (kit files travel as files); no comments, presence, gallery or auth UI; no other adapter; no automatic push (every push is a person's or a command's act); no "pull everything on start"; no deletion from the Workshop (the team's SQL is the delete). A team wanting more has a product decision to take, recorded here as not taken.

## 8. Divergences

| Doc says | Built | Why |
|---|---|---|
| `42-…` row: the note is `49-EVIDENCE-STORE.md` | `58-EVIDENCE-STORE.md` | Notes are numbered in the order written; `49-` is the Advice Desk |
| `41-…` §6.11: "new package `@craftabot/evidence` (core only)" holds the contract | The contract lives in `core` (`types/evidence-store.ts`, `schemas/evidence.ts`); the package holds the stores | `PackManifest.evidenceStores` and the testkit must name the type without the package — the sink's precedent (§2 item 1) |
| §6.11: "each carrying its own digest" | One digest rule over the canonical payload; a bundle's own digest verified besides on import | Two kinds have no digest of their own (§2 item 2) |
| §6.11: anon key and token both "in the vault" | The token in the vault; the anon key in the store's config, planted in the leak sweep all the same | One credential per declaration; the anon key is publishable by design (§2 item 4) |

## 9. Risks

- **A token in a config file.** The harness takes the token from the environment only; `--store-config` carries `anonKey`, which is publishable. The sweep plants both.
- **RLS misconfigured** would let one workspace read another's rows. `docs/evidence-setup.md` ships the policy; the live checkpoint reads with a token for another workspace and expects nothing.
- **A pulled artefact that is not what was pushed.** The digest is checked on every pull and the item refused.
- **The Supabase API changing.** PostgREST's upsert and filter grammar are stable; the fake in the test is the contract the adapter relies on.

## 10. Implementation plan

- **Stage A** — the contract in `core`, the manifest field and registry, `@craftabot/evidence` with the memory store, `checkEvidenceStore`/`describeEvidenceStoreConformance` in the testkit, `docs/schemas` regenerated.
- **Stage B** — `evidence/supabase` with its fake-PostgREST test and the skipped local-Supabase suite; `craftabot evidence push|pull`; the leak sweep extended; `docs/evidence-setup.md`; the live checkpoint.
- **Stage C** — `/workshop/evidence`, the compartment, the Audit Centre's and Campaigns' push, the Run Browser's pull; e2e over a routed fake; close-out.

## 11. Acceptance

1. The memory store passes the conformance suite; the Supabase adapter passes it against the fake and, when the environment names one, against a local Supabase.
2. A pushed item pulled back verifies; a tampered payload does not.
3. The planted token and anon key appear in no file the harness writes, nothing it prints, no trace, no URL.
4. A bundle pushed from the harness pulls into the Workshop and verifies (the second-machine proof: the Workshop's pull over the same project — the live checkpoint).
5. Every e2e is green with no store configured; the Audit Centre and Campaigns show no push control.
6. `craftabot evidence` under `--egress none` reports the refusal and exits 1.
