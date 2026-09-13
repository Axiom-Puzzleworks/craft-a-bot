# 93 — `DomainSpec`, `checkDomainPack` and the scaffold (WP107)

> **Status:** WP107's design of record, opened and closed 2026-09-12 (Phase AB, `84-DAY6-ROADMAP.md`; `83-TARGET-DESIGN-V6.md` §6.6.1–§6.6.2, decision D13, tenet 31; G66). Stage A (this note) and stages B–C built in one pass. `DomainSpec` itself, `PackManifest.domains` and the bank's `uk-retail-banking` landed a WP early, in WP106 (`92-FS-SERVICING.md`), because the coverage matrix needed them; this WP holds the bank to the spec, teaches the assurance pack to name the domain, and types the shape out.

## 1. Where the code is

- **`packages/pack-testkit/src/checks/domain.ts`** — **`checkDomainPack(spec, registry, options?)`**: the checklist, item by item (§3). `options.manifests` (the installed manifests, for what the registry does not index: calibration tables, campaigns, a workflow's book), `options.personas` (the world pack's persona ids), `options.knownGuardrails` (the host's own, for the control rows). Exported from the kit's index beside `checkCalibration`, which gains **`requireReview`** — the issue `calibration.review-pending` on a row still `review: 'pending'`.
- **`packages/governance/src/reports/assurance-pack.ts`** — **`inventory.domain`**: the domain the bot's world belongs to (the first registered spec whose `packs` name the world's pack), with its journeys counted `shipped` / `supporting` / `out`; both renderers print the line under *Inventory*.
- **`packages/harness/src/domain-pack.test.ts`** — the bank held to the checklist: green as shipped, and **a test per item** that bends or removes one thing and expects that item's issue (§3's table names each).
- **`packages/harness/src/commands/scaffold.ts`** — **`craftabot scaffold domain`**: `scaffoldDomainFiles(options)` (pure: the same options, the same files), `scaffoldDomainFormatted` (each file through Prettier under the config the output directory resolves, so the scaffold is lint-clean where it lands; Prettier loaded on demand, the files written as typed where it is absent), `scaffoldDomain` (the writer). The CLI case in `cli.ts`; `harness/src/commands/scaffold.test.ts`.
- **`examples/scaffold-domain/`** — the scaffold's output for the options on its README, **held byte for byte** by the harness test (regenerate it, never edit it): a synthetic veterinary practice (`vet-practice`) with two journeys (`vaccination`, `referral`), the root entity a `Patient`. One workspace (`--relative`), with its own tests: `checkDomainPack` green on the placeholder content, `checkCalibration({ requireReview: true })` red on every row, and per journey the book from the seed, the golden run under `rules-only` and Level 4 agreeing, the campaign parsing.
- **`packages/packs/fs-bank/src/domain.ts`**, **`obligations.ts`** — what the check found (§6).
- **`docs/manual/USER-MANUAL.md`** §36.8 and §52 (*Bringing a domain*); `packages/harness/README.md`.

## 2. What a domain pack is (`83-…` §6.6.1)

One **world pack** — the root entity in the domain's word, generators over a cited calibration table, service lines with a tier on every operation, an obligation vocabulary with glosses, a control map, personas, and the `DomainSpec` that says which packs are the domain's, which decision kinds are whose at what level and by what source, which classes are special category, which journeys are shipped, supporting or out and why — and one **journey pack** per journey: a desk, a workflow with its configurations by autonomy level, decks and cards, evaluators, a book, a campaign. The bank is the worked example: `fs-bank` and its seven desks. A domain is content; nothing in it is a mechanism (hard rule 4), and everything in it is synthetic (hard rule 9).

## 3. The checklist, item by item

`checkDomainPack` returns `ConformanceIssue[]`; an empty list is the pass. Every item names the `check` it raises and the test in `domain-pack.test.ts` that shows it red.

| # | Item | `check` | The bank's evidence | Red when |
|---|---|---|---|---|
| 0 | The spec validates against `domainSpecSchema` (`docs/schemas/domain.schema.json`). | `domain.schema` | `fs-bank/src/domain.ts` | `schemaVersion: 2` |
| 1 | Every pack the spec names — the world and every journey — is installed. | `domain.packs-registered` | eight packs | a ninth named (`fs-mortgages`) |
| 2 | Every `shipped` journey resolves to a registered workflow; every registered workflow of a journey pack is on the matrix; a `supporting` one resolves to a workflow or a world, or says why; every `out` one says why. | `domain.journey-ships`, `domain.journey-out-why` | eight shipped, one supporting, four out with a reason | a ghost row; a workflow dropped from the matrix; an `out` row's `why` removed |
| 3 | Every obligation a journey carries — the workflow's and each stage's — is in the vocabulary. | `domain.journey-obligations` | `OBLIGATION_TAGS` (`fs-bank/src/obligations.ts`) | `mlr:kyc` removed |
| 4 | Every decision kind a configuration's ceilings count is a decision right of the domain, **at the same level**. | `domain.decision-kinds` | twenty-five sourced rights | `account-open` removed; `account-open` moved to 2 |
| 5 | Every control-map row on the domain's packs resolves (`checkControlMap`: evidence, guardrails), tags aside — a row's threat tags are not the vocabulary. | `domain.control-rows` | the bank's and the desks' maps | a row citing an evaluator no pack ships |
| 6 | The calibration table the spec names is on an installed manifest, validates, and every row cites a publication or states an assumption with a note (`checkCalibration`). | `domain.calibration` | `fs-bank/calibration` (`66-…`) | a table id no manifest carries; a row with an assumption and no note |
| 7 | Every special-category class is an ontology class, and every special-category record a desk holds (revealed or hidden, in every layout) is of a class the spec names as such. | `domain.special-category` | `Vulnerability` and the `vulnerability` record | the category emptied; a class named that no class is |
| 8 | Every service line of the domain's packs declares a `riskTier` on every operation. | `domain.service-line-tiers` | the ten lines | one operation's tier removed |
| 9 | The personas are named once each, and — when the host says which — are ones the world pack ships. | `domain.personas` | `PERSONA_IDS` | one listed twice; `nobody` |
| 10 | Every journey pack that ships a journey ships a book on the workflow and a campaign on the manifest. | `domain.journey-evidence` | seven `book`s, fourteen campaigns | a `book` removed; `campaigns: []` |

**What the check cannot see, and where it lives instead.** `83-…` §6.6.1 also asks for a golden run, a red run, at least one matched pair and `checkSynthetic` over the fixtures. None is visible from a manifest: they are the pack's own tests — the bank's have all four (`workflow.test.ts`, `campaign.test.ts`, the matched pairs on lending, collections and onboarding, `desk/src/synthetic-sweep.test.ts` over the repo); the scaffold writes the golden run and the book test and leaves the matched pair to the author (the disputes desk ships none either — `90-…` §7). The manual's §52 lists them beside the checklist. **Divergence, noted.**

**Calibration review** is a separate gate on purpose: `checkDomainPack` asks that every row *cites or states*; `checkCalibration({ requireReview: true })` asks that a reader has read it. The bank's table and the scaffold's are both `pending` — the bank's until Andrew reads `66-…` §2, the scaffold's until its author cites a row. A domain that claims its calibration reviewed adds the second call to its tests and fails until it is.

## 4. The scaffold (`83-…` §6.6.2)

```
craftabot scaffold domain --id <id> --sector <sector> --jurisdiction <jurisdiction> \
  --world <pack> --journeys <a,b> --out <dir> [--root <Entity>] [--name <name>] [--today YYYY-MM-DD] [--relative]
```

**The world pack** (`<out>/<world>/`): `src/model.ts` (the root entity — `Customer` unless `--root` says otherwise, from a seed through `@craftabot/desk`'s primitives; one categorical `band` the calibration draws, one figure the journeys read), `calibration.ts` (two rows, every one `source.kind: 'assumption'` with a note and `review: 'pending'`), `lines.ts` (three lines — the record, the schedule, the ledger — each operation tiered, answering from `simulate`), `obligations.ts` (three tags with glosses under the domain id's prefix), `controls.ts` (one `unreviewed` row citing the first journey's card and evaluator), `personas.ts` (`in-a-hurry`), `domain.ts` (the `DomainSpec`: two decision rights per journey — a decision at 3, an agreement at 4 — sourced *stated by the scaffold; cite the rule that sets this*; the journeys `shipped`; one `out` row saying what keeps a journey out; the ontology `Root`/`Case`/`Decision` with no special category), `index.ts` (the manifest), `domain.test.ts` (green on the checklist, red on review).

**Each journey pack** (`<out>/<journey>/`): `src/desk.ts` (three actions — `say`, `review` at *observe*, `decide` at *reversible* — two predicates `reviewed`/`decided`, the rule in truth: a figure above the threshold is escalated), `deck.ts` (one card, two scenarios — the safe run and the person in a hurry), `card.ts` (*Review before deciding*, blocking `decide` until the figures are on the desk), `evaluator.ts` (`reviewed-before-decision`, deterministic over `action.performed`), `book.ts` (the book from the seed with the verdict in truth), `workflow.ts` (intake → review → decision → confirm → close; `rules-only` and `bot-with-a-person-at-the-close` at Level 4 with the two ceilings; `decisionKindOf`), `campaign.ts` (two scenarios × two guards × two brains × one seed, three gates including the card's), `testing/plans.ts` (the optimal and the adversary, and the stage plans), `index.ts`, `journey.test.ts` (the book byte-stable; the golden run under both configurations to the same decision, `workflowRunSchema` parsing it, byte-stable; the campaign parsing).

**Packaging.** Without `--relative`, every pack is a package of its own (`package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`) importing the world pack by name, ready to move under `packages/packs/`. With it, one workspace — a single `package.json`/`tsconfig.json`/`vitest.config.ts` at the root, the journey packs importing the world pack by relative path — which is how `examples/scaffold-domain` lives under `examples/*`. The README the scaffold writes carries the command that made it.

**Where the docs said `--journey <name>…`** the CLI's parser keeps one value per flag, so the journeys are one comma-separated `--journeys` (`--journey` accepted the same way). **Divergence, noted.**

## 5. Tests

- `harness/src/domain-pack.test.ts` — thirteen tests: green on the bank, the calibration cited-and-pending, and eleven reds (§3's last column).
- `harness/src/commands/scaffold.test.ts` — the example byte-equal to the scaffold's formatted output (file set and content), one workspace with `--relative` and a package per pack without, purity over options, the CLI's refusal without its verb or a journey.
- `examples/scaffold-domain/**/*.test.ts` — eight tests, run by `turbo run test` as a workspace of its own: the domain test (green on the checklist, red on review) and a journey test per journey (the book, the golden run, the campaign).
- `governance/src/reports/assurance-pack.test.ts` — unchanged; the inventory's `domain` is optional and absent for a bot on the starter's worlds.

## 6. What the check found on the bank

Held to its own spec for the first time, the bank was out of step with it in three places — the point of writing the check before the blueprint:

1. **`poca:sar`** — the fraud journey's `sar-filing` stage carries it; `OBLIGATION_TAGS` had `poca:tipping-off` alone. Added, with its gloss.
2. **Five decision kinds unnamed** — the advice journey counts `personal-recommendation` (3) and `investment-execution` (4); the complaints journey `redress-within-limit` (4), `redress-above-limit` (3), `complaint-declined` (3). The spec had `regulated-advice` and `redress` as the *rows* of the decision-rights table and not the *kinds* the workflows count. The five are added beside them, sourced COBS 9 and DISP, the table's rows kept.
3. **`account-restriction` at two levels** — the fraud workflow's ceilings (`76-…`) put it at 3 on the Article 22 reading (an adverse action on a customer's account is a person's below four eyes); the spec, written in WP106, had 4 citing SS1/23. The spec now says 3, sourced UK GDPR Article 22, matching the journey that runs. **For Andrew's reading**, with the rest of the decision-rights table: whether a freeze is the assistant's under oversight (4) or a person's (3) is a policy choice the bank has now made one way in code.

The `special-category` item also sharpened its test: shrinking the category to the one class the record already is proves nothing; emptying it does.

## 7. Divergences and decisions

- `DomainSpec` was built in WP106, not here (`92-…` §7).
- `checkDomainPack` verifies what a manifest shows; the golden run, red run, matched pair and synthetic sweep are the pack's tests (§3).
- `--journeys a,b` for the docs' repeated `--journey` (§4).
- The scaffold formats its output with Prettier when it can find it, so the committed example is byte-equal to a *formatted* rendering; `scaffoldDomainFiles` alone is the unformatted shape.
- The example is one workspace, not packages under `packages/packs/`, so it never enters an edition's bundle or the harness's default packs; a real domain moves its packs under `packages/packs/` and registers them as `95-…` §1 lists for a desk.
- The scaffold's decision rights and calibration rows are marked *stated by the scaffold*; the assurance pack's domain line and the journeys page will show a scaffolded domain the moment its packs are registered — nothing in the scaffold is hidden from the instruments.

## 8. Stage notes

> **Stage A–C — 2026-09-12.** This note; `checkDomainPack` and `requireReview` in the kit; the assurance inventory's domain line; the bank held to the checklist and brought into step (§6); `craftabot scaffold domain` with its formatted, byte-held example under `examples/scaffold-domain` and the example's own tests; the manual's §36.8 and §52; the harness README. Budgets untouched: nothing here enters a bundle.

> **WP108 — 2026-09-13.** The blueprint and the three notes (`docs/blueprints/`): §3's table as prose with a bank file per row, the four run-level items named as the pack's tests, and three domains applied without code — each with a `DomainSpec` fixture that validates and fails the check for want of its packs (`harness/src/blueprints.test.ts`). The scaffold's tree (§4) is what each note's checklist is reviewed against.
