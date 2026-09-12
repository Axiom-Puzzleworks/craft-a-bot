# 86 — The Guardrail Catalogue (WP98)

> **Status:** WP98's design of record, opened 2026-09-12 (Phase Y, `84-DAY6-ROADMAP.md`; `83-TARGET-DESIGN-V6.md` §6.4, tenet 28, G62). Stage A — the entry schema, the taxonomy, the vocabularies, the sourcing rule and the coverage rule, with the first edition's entries as a table on paper — is **awaiting Andrew's reading** (`84-…` §8 item 2): every entry is `review: 'pending'` until he has read it against its sources, and the page counts them. Stages B and C were built the same day on that footing, marked, not assumed.

## 1. Where the code is

- **`packages/core/src/schemas/catalogue.ts`** — `catalogueEntrySchema`, `guardrailCatalogueSchema`, the closed vocabularies (`CATALOGUE_CATEGORIES`, `CATALOGUE_MATURITIES`, `COVERAGE_STATUSES`, `ASI_THREATS`, `LLM_THREATS`, `FRAMEWORK_PREFIXES`); `docs/schemas/guardrail-catalogue.schema.json`.
- **`packages/governance/src/catalogue/entries.ts`** — the first edition (`GUARDRAIL_CATALOGUE`, edition `2026-09`): the entries, their sources, their coverage on 2026-09-12. **`check.ts`** — `checkCatalogue(catalogue, registry)`.
- **`packages/governance/src/reports/coverage.ts`** — `coverageReport`, `coverageSummary`, `renderCatalogueMarkdown`; the assurance pack's `mitigants.coverage` and both renderers' *Coverage* subsection.
- **`scripts/catalogue-doc.mjs`** — `docs/catalogue.md`, generated and checked on build (`npm run catalogue:doc`).
- **`apps/workbench/src/routes/workshop/catalogue/`** — the page; the Assurance lens's *Coverage* beneath the register.
- **Tests** — `governance/src/catalogue/catalogue.test.ts` (shape, refusals, the fold, the page); `harness/src/catalogue.test.ts` (every shipped component resolves against every pack; every obligation is the bank's).

## 2. Principles and the sourcing rule

1. **Honest coverage** (tenet 28). *Shipped* means a component or a mechanism exists here and the register can show what it did; *connectable* means the shell meets a vendor's contract and a checkpoint proves it; *bespoke* means a design of record exists, built in part or as content; *blueprint* means the technique is described and mapped and nothing is built; *not applicable* is said, with the reason. Nothing is implied — `checkCatalogue` refuses a *shipped* entry that names nothing, a *connectable* entry whose component declares no connection, a *blueprint* that names an implementation, a *not-applicable* with no reason.
2. **Every entry cites.** At least one source — a standard, a vendor document, a paper or a guidance note — with a publisher and a year; a URL where the reference has one. The sources are the ones `19-AI-SAFETY-GOVERNANCE-REFERENCE.md` gathered in August 2026, by section; an entry that cites nothing does not parse into the edition.
3. **Reviewed content, like the calibration table** (`66-…`). Every entry carries `review: 'pending' | 'reviewed'`; the first edition is pending in full until Andrew has read it. Marking an entry reviewed is a content change with a reader's name in the commit, never a build step.
4. **Techniques, not vendors.** An entry is a technique; the vendors and papers that ship or propose it are its sources; the components that implement it are on its coverage. A vendor connection (Lakera, Bedrock — WP99) moves an entry's status, not its identity.
5. **The roadmap moves entries rightward and nothing else does.** The coverage column is what the code does on the day; a work package that lands a component updates the entry in the same commit.

## 3. The entry

```ts
interface CatalogueEntry {
  id: string;                      // kebab-case: 'prompt-injection-classifier', 'policy-decision-point', …
  name: string; summary: string;
  category: 'runtime-protection' | 'secure-by-design' | 'identity-and-access' | 'component-hardening' | 'evaluation-and-assurance' | 'human-oversight';
  subcategory: string;             // 'input-guardrail', 'output-guardrail', 'action-control', 'policy-as-code', 'information-flow', 'monitoring', 'human-in-the-loop', …
  points: PointKind[];             // where in the loop it decides, if it decides
  maturity: 'widely-adopted' | 'emerging' | 'research';
  threats: string[];               // ASI01–ASI10, LLM01–LLM10, AML.T… (closed by pattern)
  frameworks: string[];            // '<prefix>' or '<prefix>:<ref>' — nist-ai-rmf, nist-ai-600-1, iso-42001, iso-23894, eu-ai-act, pra-ss1-23, fca, owasp, cisa, mitre-atlas
  obligations?: string[];          // the bank's tags (48-… §5) where one applies
  sources: Array<{ title; publisher; year; url?; kind: 'standard' | 'vendor' | 'paper' | 'guidance' }>;
  coverage: { status; componentIds?; implementedBy?; note; since? };
  bankingRelevance: 'core' | 'supporting' | 'none';
  review: 'pending' | 'reviewed';
}
```

One divergence from `83-…` §6.4.1: **`coverage.implementedBy`** — a *shipped* technique is not always a component. Stage-output validation is the workflow runtime's, drift is a fold, the safety case is a report; the entry names what implements it in the code's own words, and `checkCatalogue` accepts either a component or a named mechanism for *shipped*. A *connectable* entry must name a component with a `connection`.

## 4. The taxonomy and the first edition

Six categories (the survey's five plus human oversight) and the sub-categories the entries use. The first edition has **forty-five entries**; the table is `docs/catalogue.md`, generated from the content so the page and the code cannot disagree. By status on 2026-09-12: see the page's header line. The entries the product does *not* claim — blueprint and not applicable — are listed by name at the page's foot and in the assurance pack's §5.

## 5. The coverage fold

`coverageReport(catalogue, registry, results?)`: one row per entry with the entry's status, the registered components that implement it, the stacks (`89-…`) that fit one of them, and — joined through `Stack.controls` — the register's largest-*n* headline effect for a control such a stack claims, where an experiment measured it. `coverageSummary` gives the counts and the two lists. The row count equals the catalogue's, always.

## 6. `checkCatalogue`

Five refusals: `catalogue.parses` (the schema), `catalogue.cited` (a source with no title or publisher), `catalogue.component` (a `componentIds` entry nothing ships), `catalogue.status` (a status that does not match what the entry names — §2 item 1), `catalogue.unique` (an id listed twice). The governance test runs it over the edition with the built-in components; the harness test runs it against every pack the default host installs, where every service and monitor component resolves.

## 7. The page

`docs/catalogue.md` — one table per category, every entry with its status and note, what implements it, its threats and its sources with the year; the header line counts the statuses and the review; the foot lists what is not claimed. `/workshop/catalogue` — the same rows on a `CaseTable`, with a threat filter (ASI01–10), a maturity filter and a coverage filter; a row's components link the Guard Rack. The Assurance lens's entry gains *Coverage* beneath the register: the counts and the two lists. The assurance pack's §5 gains the same subsection in both renderers.

## 8. Divergences from `83-…` §6.4

- `coverage.implementedBy` (§3): a shipped mechanism beside a shipped component.
- The first edition is forty-five entries, not "fifty-odd": the design's rows that bundled several vendors of one technique are one entry with several sources, and the techniques the design listed under *Day 6* that are not yet built are entries with `blueprint` status rather than absent.
- A row opens the Guard Rack for its components; the Studio it would open is WP101's.
