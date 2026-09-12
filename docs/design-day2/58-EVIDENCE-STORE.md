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
8. **A store may not hand the payload back byte-for-byte** (found at the live checkpoint). Postgres keeps the payload as `jsonb`, which reorders object keys; `checkEvidenceStore` compared a pulled payload with `JSON.stringify` and called a bundle and an assurance pack "changed" while their digests verified. **Fixed:** the check compares canonical JSON — the digest is over canonical JSON for exactly this reason (item 2), and the fake PostgREST, which kept key order, had hidden it.
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

> **Stage A landed 2026-09-06.** The contract in `core` (§4.1): `types/evidence-store.ts` (`EvidenceStore`, `EvidenceStoreInstance`, `CreateEvidenceStoreOptions`, `describeEvidenceStoreProblems`) and `schemas/evidence.ts` (`evidenceItemSchema` as the closed union, `evidenceReceiptSchema`, `EvidenceQuery`, `computeEvidenceDigest` over `canonicalJson`, `verifyEvidenceItem`, `evidenceItemFor`, `evidenceIdFor`); `PackManifest.evidenceStores?` with the registry's shape check, `getEvidenceStore` and `listEvidenceStores`; `docs/schemas/evidence-item.schema.json` generated and checked on build. `@craftabot/evidence` (§4.2) with `evidence/memory` (one shared map per workspace, so two instances over the same workspace see the same rows) and the `evidence` pack; `checkEvidenceStore` and `describeEvidenceStoreConformance` in the testkit — the round-trip half for a store that never calls out (push, verify, a wrong digest refused, pull back unchanged), the network half for one that does (a refused `fetch` rejects push, pull and verify, the planted secret in no message). One id rule corrected on the way: an assurance pack names its bot as `bot.id`, so its item id is `assurance/<bot.id>/<generatedAt>`.
>
> **Stage B landed 2026-09-06.** `evidence/supabase` (§4.3): PostgREST over `fetch`, a table per kind, the token as `Authorization: Bearer` and the anon key as `apikey`, an upsert with `resolution=merge-duplicates`, filters by workspace, id and `pushed_at`, `verify` selecting the digest alone; a transport failure reported in the adapter's own words and a refusal by status and PostgREST's `message`, never the request. Its test runs the whole conformance suite over a fake PostgREST in memory (`fake-postgrest.ts`, test scaffolding, excluded from the build) that scopes rows by the token's workspace as the policy does, checks every request's headers and that no URL carries the token or the anon key, and proves a token for another workspace sees nothing and cannot write; the suite against a real project runs only when `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `CRAFTABOT_CREDENTIAL_EVIDENCE_SUPABASE` are set (skipped in CI). `craftabot evidence push|pull` (§4.4): `push` takes `--run`, `--group`, `--campaign-report`, `--assurance [--agent]` or `--content-file`, builds the item from the file store (a run's bundle redacted against every secret the process holds) and prints the receipt; `pull` verifies every item's digest and a bundle's own, writes the verified ones under `--dir/<kind>/…` (a bundle as `.craftabot-bundle.json`), lists a failed one `REFUSED` and exits 1; the `evidence` pack is in `defaultPacks`. The key-leak sweep plants the workspace token and the anon key and runs a push and a pull under `--egress none`, which exit 1 with neither in anything printed or written. `docs/evidence-setup.md`: the four tables and the row-level-security policy as one SQL block, a Node one-liner that mints a workspace token from the project's JWT secret, the harness commands, what leaves the machine. **The live checkpoint is not yet taken:** applying the migration to a real project and minting a token from its JWT secret are the team's own acts (§3, §4.3); the project exists and holds no `evidence_*` table, and the checkpoint is recorded here when it is taken.
>
> **Stage C landed 2026-09-06 — WP70 closed (the live checkpoint pending).** `/workshop/evidence` (§4.5) on the rail between *Sinks* and *Playground*: one card per registered store (the Sinks page's shape — config as JSON, *Will call:* from the store's egress, save and forget) with the battery beside it (a lamp for the token in the vault under the store's credential id, *Fit* and *Eject*); a *Push* row over what this browser holds (a run or an episode as its bundle, a campaign report, a bot's assurance pack, an authored record) with the receipt shown; a *Pull* row (kind, pushed after) listing each item with a lamp for its digest — `verifyEvidenceItem` and, for a bundle, `verifyBundleDigest` — and *Import* enabled only when both hold (a bundle into the runs, events and evaluations with its group record, a report into the campaign reports, a record into the content store; an assurance pack is read, not stored). `lib/state/evidence.svelte.ts` keeps `cab.evidence.v1` (store id and config, never the token) and builds an instance behind the egress guard with the vault answering; `lib/workshop/evidence.ts` builds the items and imports a pulled one. The Audit Centre offers *Push to evidence store* beside its download for a run and for an episode, Campaigns a *Push* on each saved report, and Settings a compartment for the token — each only once a store is configured. Proofs: `evidence.spec.ts` over a Playwright route standing in for PostgREST — unconfigured, the Audit Centre shows no push control (§11 item 5); configured with a token fitted, a played run pushed from the Audit Centre lands as a bundle row in the workspace with the token and the anon key in no URL, pulls back verified and imports; a row tampered in the project is listed *digest mismatch* and cannot be imported; a project answering 401 is reported by its message with the token absent. Every default e2e and the visual set are green with the store unconfigured. The second-machine proof over a real project (§11 item 4) is the live checkpoint's.

> **Live checkpoint taken 2026-09-06** against a real Supabase project (`xitxrmhpiuxnqjrcimeq`, eu-west-2). The migration in `docs/evidence-setup.md` §1 applied through the Supabase tools (`craftabot_evidence_store`): four `evidence_*` tables with row-level security and the `workspace_rows` policy, the security advisor raising nothing about them. The project has moved to asymmetric signing keys (ECC P-256 current); a workspace token signed HS256 with the **Legacy JWT Secret** and no `kid` is still verified while that key stands as a previous key (a `kid` naming it was refused either way), so §4.3's minting stands with that caveat recorded in the setup doc. The live suite ran green over the real project (18 of 18, the round-trip of all four kinds in 715 ms), after finding 8 (§2) — `jsonb` reorders keys — was fixed in the check. A scripted Advice Desk run from the harness pushed as its bundle (receipt digest `4b77ed8b…`, `storedAt 2026-09-06T17:59:23Z`, workspace `conformance`), and the row read back from the project by SQL carries the same digest with `pushed_by craftabot-harness` and a 132 kB payload. The token was minted, held and used in the maintainer's own shell (a masked PowerShell prompt drops a paste in this terminal; a plain prompt with the screen cleared after is what worked); it appears in no file, trace, log, URL or message. §11 items 1 and 4 are met; the Workshop's pull over the same project is the same adapter behind the same guard, proved over the routed PostgREST in `evidence.spec.ts`.

> **Amended 2026-09-11 (WP84, `75-THE-MONITOR.md` §6).** Two kinds join `evidenceKindSchema` — `workflow-run` (payload `workflowRunSchema`) and `bank-run` (payload `bankRunSchema`) — with their tables `evidence_workflow_runs` and `evidence_bank_runs` in `docs/evidence-setup.md` §1 (the six-table migration; a project provisioned with four keeps working for the four). They are the ingest seam's artefacts: `evidenceMonitorSink` in `@craftabot/workflow` pushes a day's workflow runs, its agent runs as one-run bundles and the `BankRun`; `monitorRunsFromEvidence` pulls them back by date into the Monitor's fold. The Workshop's Evidence page pulls and lists them as it lists an assurance pack — verified, offered as a download, no local store. `craftabot evidence pull --kind` accepts them. Still a sync target for artefacts only: never a key, never the source of truth, never required.

> **Amended 2026-09-11, later (WP89, `72-EXPERIMENTS.md` §4).** Two more kinds — `experiment` (the design, an opaque record here: it lives beside the campaign schema in `evals`) and `experiment-result` (payload `experimentResultSchema`, whose own digest the reader verifies besides the item's) — with their tables `evidence_experiments` and `evidence_experiment_results` in `docs/evidence-setup.md` §1 (the eight-table migration; a project provisioned with six keeps working for the six). The register (WP90) folds results pulled from the store as it folds the local ones.
