# 40 — Debts (WP52)

> **Status:** design of record for WP52 (`27-DAY3-ROADMAP.md` Phase L's last row), written 2026-09-03 against the codebase after WP51. This is the map for `26-TARGET-DESIGN-V3.md` §6.15's remaining sentences — the autonomy picker, `D13`, the Ollama endpoint, the `ArmourPanel` verification — and `27-…` §7's row for `personas`; where a doc and what ships differ, §7 below says why and the doc gets a dated note.

---

## 1. Purpose

Five things earlier WPs recorded as owed rather than built, each small, each with a doc that names it. `14-…` §4.6 (WP24): "`autonomy` ships schema-only … building the picker is future Workshop work". `13-…` §7 (WP21): "semver ranges evaluated (D13) is not built anywhere … an unchecked bullet until D13 itself lands". `06-…` §8 (WP26): "Ollama's own base URL stays a fixed constant … the safe version of 'later' is a real, separate piece of scope". `25-…` §8 (WP35): the `ArmourPanel.svelte` follow-up, which WP39 made unnecessary with the schema panel's `'object'` case and `27-…` §7 asks WP52 to verify. And `27-…`'s own row: `personas` ships cartridges that name OpenAI's provider without saying so in its manifest. WP52 pays each with its own test, and closes Phase L.

---

## 2. Where the code actually is

**Autonomy.** `core/src/schemas/agent-spec.ts` — `safetyBrickSchemaV2 { maxTicks, maxTokens?, blockedActions, approval: 'off'|'everything'|'risky', repeatLimit?, policyCards?, autonomy?: 'operator'|'collaborator'|'approver'|'observer' }`; the engine reads `approval` and the budgets, never `autonomy`. `routes/workshop/spec/[agentId]/+page.svelte` — the Spec Lab: the contract table, the safety stack (`fitToStack`/`unfitFromStack` through `persist(bricks)`), the policy cards, the JSON. **D13.** `core/src/schemas/pack-manifest.ts` — `packManifestMetadataSchema { id, name, version, requiresCore }`, strings never parsed; `core/src/pack-registry.ts` — `registerPack` stores them; `core/src/persistence/kit-export.ts` — `importKitFile(json, { installedPacks, installedBrickKinds?, … })` checks presence of `requires.packs` keys and `requires.brickKinds`, never a range; `pack-testkit/src/checks/manifest.ts` — "semver range evaluation is deliberately not checked here". No semver library in the tree. **Ollama.** `packs/ollama/src/catalogue.ts` — `OLLAMA_BASE_URL = 'http://localhost:11434/v1'`; `provider.ts` — `createOllamaProvider({ fetch?, baseUrl? })` already takes a base URL; `index.ts` — the factory's `create({ fetch })` never passes one; `OLLAMA_EGRESS` declares `localhost` and `127.0.0.1`; `core/src/types/provider.ts` — `ProviderFactory.create(options: { apiKey; fetch? })`; `workbench/lib/brain.ts` — `chooseBrain` calls `create({ apiKey: '' })` for a keyless provider; `lib/state/settings.ts` — the preferences schema. **ArmourPanel.** `lib/components/bench/panels/schema-fields.ts` — `describeFields` with an `'object'` control (`{ kind: 'object', fields }`), `SchemaPanel.svelte` rendering it as a fieldset; no `ArmourPanel.svelte` exists and none ever did (`27-…` §8 item 8). **Personas.** `packs/personas/src/index.ts` — `{ id: 'personas', version: '1.0.0', requiresCore, cartridges }`; `catalogue.ts` — `PERSONA_PROVIDER_ID = OPENAI_PROVIDER_ID`; both hosts register `openAiPack` before `personasPack`.

---

## 3. Design principles

1. **A preset writes real values.** The autonomy dial is what `14-…` §4.6 already decided: picking a level writes `approval` and the budgets into the fitted Safety Brick's config and records the level; the engine keeps reading only what it always read.
2. **A range is evaluated, or it is not written.** One evaluator in core, small and tested, used by the registry, the kit importer and the conformance kit; a pack that says `>=1.0.0` is held to it.
3. **A local endpoint is a preference, checked twice.** The Settings field accepts loopback only; the factory refuses anything else even if handed it; the egress guard would refuse it a third time.
4. **A dependency is declared where it is consumed.** A pack whose content names another pack's provider says so in its manifest, and the registry refuses to register it without the pack it names.

---

## 4. The design

### 4.1 The autonomy picker (Spec Lab)

`lib/workshop/autonomy.ts` — pure:

```ts
export const AUTONOMY_LEVELS = ['operator', 'collaborator', 'approver', 'observer'] as const;
export const AUTONOMY_PRESETS: Record<AutonomyLevel, { approval; maxTicks; maxTokens; blurb }> = {
	operator:     { approval: 'everything', maxTicks: 20,  maxTokens: 20_000,  blurb: 'A person confirms every call.' },
	collaborator: { approval: 'risky',      maxTicks: 30,  maxTokens: 50_000,  blurb: 'Asks before anything it cannot undo; runs the rest.' },
	approver:     { approval: 'risky',      maxTicks: 60,  maxTokens: 100_000, blurb: 'A longer leash, still asked about the risky calls.' },
	observer:     { approval: 'off',        maxTicks: 100, maxTokens: 200_000, blurb: 'Runs on its own; a person watches the trace.' }
};
export function applyAutonomy(spec: AgentSpecV2, level: AutonomyLevel): AgentSpecV2 | undefined; // undefined when no starter/safety brick is fitted
export function autonomyOf(spec: AgentSpecV2): { level?: AutonomyLevel; approval?; maxTicks?; maxTokens? };
```

`applyAutonomy` finds the first fitted `starter/safety` brick and writes `autonomy`, `approval`, `maxTicks` and `maxTokens` into its config, leaving everything else. The Spec Lab gains an "Autonomy" block beside the safety stack: a select over the four levels with each blurb, an Apply button, and a readback line (`autonomy-readback`) that shows the level recorded and the concrete `approval` / `maxTicks` / `maxTokens` the config now carries — read from the spec, not from the preset, so the readback cannot lie. With no Safety Brick fitted the block says so and the button is disabled. The e2e builds a bot with a Safety Brick, picks `approver`, and reads back `risky`, `60` and `100000` in the readback and in the spec JSON.

### 4.2 Semver evaluation (D13)

`core/src/semver.ts` — `parseVersion('1.2.3')`, `compareVersions`, `satisfiesRange(version, range)` over the subset the tree uses and a kit file might carry: `*`, an exact version, the comparators `>=`, `>`, `<=`, `<`, `=`, the caret `^x.y.z` and tilde `~x.y.z`, space-joined comparators as AND, `||` as OR. Anything it cannot parse is `false`, never a throw — a range that cannot be read cannot be satisfied. Prerelease tags are compared as strings after the numbers, which is all `1.0.0-rc.1` needs. `CRAFTABOT_CORE_VERSION` is exported from core and held to `package.json` by a test, as governance's is.

Where it is used: `registerPack` refuses a pack whose `requiresCore` the core version does not satisfy, naming both; `packManifestMetadataSchema` gains `requiresPacks?: Record<string, string>` and `registerPack` refuses a pack that names one not yet registered or registered at a version outside the range (so a host's pack list is in dependency order, which both hosts' already are); `importKitFile` gains `installedPackVersions?: Record<string, string>` and `coreVersion?: string` — when given, `requires.core` and each `requires.packs` range are evaluated and a mismatch is a new `ImportProblem` of kind `'version-mismatch'` naming the pack, the range and the version to hand; omitted, the check is skipped as the brick-kinds check already is; both hosts pass them. `checkManifest` evaluates `requiresCore` against the core version and `requiresPacks` against the companion packs, as `manifest.requires-satisfied`. `13-…` §7's bullet is checked with a dated note; the cartridge-defaults bullet was already checked by WP26's own note.

### 4.3 The Ollama endpoint

`settings.ts` gains `ollamaEndpoint: z.string().default('http://localhost:11434/v1')` refined by `isLoopbackEndpoint` — a parseable `http:` URL whose hostname is `localhost` or `127.0.0.1` — so a stored value that is not loopback falls back to the default like any other unreadable preference. `ProviderFactory.create` gains an optional `endpoint?: string` (additive; every existing factory ignores it). The Ollama factory passes it as `baseUrl` **only if** `isLoopbackEndpoint` says yes; otherwise the default, so a caller cannot point the pack off the machine even by bypassing Settings. `chooseBrain` hands `preferences.ollamaEndpoint` to a keyless provider's `create`. Settings renders a "Local models" panel with the field (`ollama-endpoint`), a note that only this computer is allowed, and a refusal message for anything else (`ollama-endpoint-refused`). The e2e sets `http://127.0.0.1:11434/v1`, stubs that host, and sees the run's thought arrive; then types an outside address and sees it refused and the stored value unchanged. `OLLAMA_EGRESS` is unchanged: the guard is the third lock.

### 4.4 `ArmourPanel.svelte`, verified

No file, and none is needed: `describeFields` over `armorBrickKind.configSchema` yields an `'object'` control for `filters` with one enum control per filter beneath it, and `SchemaPanel` renders that case. WP52 pins it with a unit test in `schema-fields.test.ts` over the real kind and records the verification in `25-…` §8 and `27-…` §7.

### 4.5 `personas` declares its dependency

`personasPack.requiresPacks = { openai: '>=1.0.0' }`. The registry check from §4.2 refuses the pack without `openai` present; its contract test registers `openAiPack` as a companion; a test shows the refusal names the missing pack.

---

## 5. Non-goals

Full semver (build metadata, hyphen ranges, `x`-ranges); a custom endpoint for any provider but Ollama; `autonomy` read by the engine; a Kit-side autonomy control.

---

## 6. Stages

- **A — core.** `semver.ts` with its test and `CRAFTABOT_CORE_VERSION`; `requiresPacks` in the metadata schema; the registry's two refusals; `importKitFile`'s `version-mismatch`; `ProviderFactory.create`'s `endpoint`; the testkit's `manifest.requires-satisfied`; `personas` declaring; the Ollama factory's loopback rule with `isLoopbackEndpoint`.
- **B — the app.** `lib/workshop/autonomy.ts` and the Spec Lab block; the Settings field and `chooseBrain`; both hosts passing versions to `importKitFile`; the `filters` test; e2e for the picker and the endpoint.
- **C — close-out.** Stage notes here; `13-…` §7, `14-…` §4.6, `06-…` §8, `25-…` §8 notes; `26-…` §12; `27-…` row and §8 item 21 (Phase L closed; the roadmap's forward plan exhausted); `CLAUDE.md`; the README.

---

## 7. Divergences, with reasons

- **`requiresPacks` is new manifest metadata.** `27-…`'s row asks `personas` to declare its dependency "honestly", and a comment cannot be checked; a field the registry enforces can. Additive and optional.
- **The registry refuses out-of-order registration rather than resolving it.** Ordering packs is the host's one-line job and both hosts already do it; a resolver would be mechanism for a problem nobody has.
- **The Ollama endpoint is loopback by hostname, not by resolution.** A hostname that resolves to loopback through DNS is not loopback to this check; `localhost` and `127.0.0.1` are what the egress declaration names, and the field matches the declaration rather than the network.
