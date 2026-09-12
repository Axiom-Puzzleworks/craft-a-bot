# 70 — Context: the ladder and the ontology (WP81)

> **Status:** design of record for WP81 (`65-DAY5-ROADMAP.md` Phase S), opened 2026-09-11 on the `day5` branch after WP80. Stage A is this note; stage B the `ContextSpec` and the desk runtime composing the case by level with `checkDesk`'s superset property; stage C the bank's ontology, the knowledge card and the `graph` line; stage D the campaign axis.
>
> **What this is.** `64-TARGET-DESIGN-V5.md` §6.3 (retires G46): what a bot is given about the case before it acts, on a ladder — `minimal`, `case-file`, `relational`, `ontology` — as a campaign axis, with purpose-gating unchanged at every rung, and the bank's entities and relationships as a typed graph a bot can be handed as a card and can query through a line.

---

## 1. Where the code is

1. **A desk's case is `revealed` + `hidden` + `queue` + `extra` + `truth`** (`43-…` §4.4): `buildState(layout, seed, config)` in `desk-world.ts` clones `revealed` into `state.records` and `hidden` into `state.hidden`; a handler's `ctx.reveal(id)` moves a record across. The create-time `config` (WP78) is kept on the state and reaches `layout.case(random, config)`.
2. **Senses render what they choose.** The runtime's built-in `case-file` sense lists `state.records`; the Advice Desk's `customer-record` sense lists the personal records on the desk; the Lending Desk's senses each read one record. A record in `records` is not necessarily seen — a sense has to show it.
3. **Purpose-gating is the bank's** (`48-…` §4.5): `mayRead(purpose, record)` refuses a `special-category` record for a purpose not in `PURPOSE_ALLOWS_SPECIAL_CATEGORY` (`advice`, `complaints`); `checkDesk` refuses a special-category record revealed at the opening on a desk with no purpose (`45-…` §4.3).
4. **`bankRecords(bank)`** splits one `BankCase` into `revealed` (the notice, the products) and `hidden` (the customer, the vulnerability as special-category, the bureau, the accounts and their recent activity, the complaints), every record classified.
5. **The service lines** (`47-…`) are nine; the Connector synthesises a tool per operation; `simulate(op, args, ctx)` reads `ctx.worldState` — `bankExtraOf` — and never acts.
6. **The campaign's axes** are scenario × build × guard × brain × seed (and, since WP80, item × build × guard × brain); `injectedWorld` and the plain `create` both take the build's `config`; the summary's slice key is `scenario guard brain`; `gateWhereSchema` names those and `cohort`.
7. **`WorkflowConfig.context`** has been carried untyped since WP79 for this note.

## 2. Principles

- **More context never loses a record.** Each rung's `records` is a superset of the rung below (the property `checkDesk` runs); a level adds, it never rearranges.
- **Purpose-gating is unchanged at every rung.** A special-category record never enters the case by context; it reaches the desk as it always has — hidden, and revealed by a handler that the purpose allows. The knowledge card and the graph line refuse by purpose with the lines' own finding.
- **Context is the world's, not the spec's.** It reaches the desk at `create` as `config.context`, beside the knobs; a bot's spec is the same at every rung, so the rung is the only thing that moved.
- **Deterministic and budgeted.** A knowledge card is byte-stable per seed, depth and purpose; a token budget truncates it deterministically with a note, so a level is comparable across cases.
- **The evaluator says what the context cost.** `data-minimised` already scores what a build read; a record handed over by context is a read it did not choose, and is scored as one.

## 3. The contract (in `core`, `types/context.ts`, `schemas/context.ts`)

```ts
export type ContextLevel = 'minimal' | 'case-file' | 'relational' | 'ontology';
export type ContextDelivery = 'brief' | 'sense' | 'line';
export interface ContextSpec {
	id: string;
	level: ContextLevel;
	include?: string[];              // record kinds pulled onto the desk from hidden at this rung, beyond the rung's own
	exclude?: string[];              // record kinds the rung would add but does not
	ontology?: { scope: 'customer' | 'bank'; depth: number; relations?: string[] };
	delivery: ContextDelivery[];     // where the added context reaches the bot
	budgetTokens?: number;           // the knowledge card is truncated to this, with a note
}
export const DEFAULT_CONTEXT: ContextSpec = { id: 'case-file', level: 'case-file', delivery: ['sense'] };
export const CONTEXT_LEVELS: ContextLevel[]; contextSpecSchema; contextSpecFor(level): ContextSpec;
```

`WorkflowConfig.context?: ContextSpec` (typed now), reaching the world at `create` as `config.context` beside `knobs`.

## 4. The desk runtime (`@craftabot/desk`, stage B)

`DeskWorldSpec.context?(level, generated: DeskCase, spec: ContextSpec): DeskRecord[]` — what this desk adds at a rung beyond `case-file`, content the desk knows how to make; a desk without it adds nothing at `relational` and `ontology`, and the ladder still holds.

`buildState` reads `config.context` (parsed; a malformed one throws at `create`, as a misspelt knob does) and composes `records`:

| Rung | `records` at tick 0 |
|---|---|
| `minimal` | `revealed` kept to the work item — the records the queue names (`queue[].recordIds`) — with the desk brief dropped; a desk with no queue keeps its `revealed` |
| `case-file` | `revealed`, as today |
| `relational` | `case-file` + `spec.context('relational', …)` |
| `ontology` | `relational` + `spec.context('ontology', …)` — the knowledge card on top of the related records, so the rung is a superset of the one below (principle 1; a divergence from the design's table, §8) |

At every rung: `include` pulls hidden records of the named kinds onto the desk (the desk brief and the work item never leave); `exclude` drops the rung's added kinds; a special-category record added by context is dropped before it lands, whatever the purpose (principle 2); every context-added record's `text` is truncated to `budgetTokens × 4` characters with `… [truncated to N tokens]` when a budget is set. Context-added records are not marked on the record — their ids are remembered on the state (`state.contextRecordIds`, present only when a context was configured) so an evaluator can tell them from what a handler revealed.

**Delivery.** `sense`: the observation carries a *Handed over as context* line — the context-added records in the case-file rendering — whatever senses the bot has on, under the `context` channel id; a bot's spec is untouched, and a trace with no context configured is byte-identical to before. `brief`: the rendering is appended to the desk brief's `text` (the `desk-brief` notice), where a desk has one. `line`: a note in the rendering that the `graph` line answers questions — the line itself is always there (stage C). The default delivery is `sense`.

**`checkDesk`** gains `desk.context-superset`: for every layout, the desk is created at each rung (the fixture's `contexts` or the four defaults) and each rung's record ids are a superset of the rung below's; and `desk.context-classification`: no special-category record enters `records` at any rung that was not in `revealed` at `case-file`. Runs on every desk in the repo through the packs' contract tests.

## 5. The ontology (`fs-bank/src/ontology.ts`, stage C)

```ts
export interface Ontology {
	classes: Record<string, { description: string; attributes: string[]; specialCategory?: boolean }>;
	relations: Record<string, { from: string; to: string; description: string; purposes?: string[] }>;
	instances(scope: OntologyScope): Iterable<{ id: string; class: string; attributes: Record<string, string | number | boolean> }>;
	edges(scope: OntologyScope): Iterable<{ from: string; relation: string; to: string }>;
}
export function bankOntology(extra: BankExtra): Ontology;
export function knowledgeCard(ont, root, depth, purpose, options?: { relations?: string[]; budgetTokens?: number }): string;
export function neighbours(ont, id, purpose, relation?), pathBetween(ont, a, b, purpose), describeClass(ont, name);
export const graphLine: ServiceLine;   // 'fs-bank/graph': neighbours · path · describe — the tenth line, tier observe
```

**Classes** (twelve): `Customer`, `Account`, `Transaction`, `Product`, `Application`, `Decision`, `Complaint`, `Alert`, `Vulnerability` (special-category), `Obligation`, `Control`, `ServiceLine`, `Desk`. **Relations**: `holds` (Customer→Account), `transacted` (Account→Transaction), `holdsProduct`/`eligibleFor` (Customer→Product), `appliedFor` (Customer→Application), `decided` (Application→Decision), `complainedAbout` (Customer→Complaint), `discloses` (Customer→Vulnerability, `purposes: ['advice', 'complaints']`), `hasFile` (Customer→BureauFile as an attribute block on the customer), `governedBy` (Desk→Obligation), `evidencedBy` (Obligation→Control), `reaches` (Desk→ServiceLine). The governance entities come from the bank's own content — `OBLIGATION_TAGS`, `BANK_CONTROL_ROWS`, `bankServiceLines`, the purposes as desks — so a bot at the `ontology` rung can be asked to cite the obligation its action serves.

**Scope.** `customer` is the case's customer and everything one relation away, to `depth`; `bank` adds the governance entities and the shelf. **Purpose.** `knowledgeCard`, `neighbours` and `pathBetween` drop instances of a special-category class and edges whose relation names `purposes` the purpose is not in; the line answers with the lines' own `notForPurpose` finding for a root it may not describe. **Rendering.** One line per instance in id order — `Customer c-… (name …; employment …)` — then one per edge — `c-… —holds→ account-…` — depth-first from the root, ids sorted, no timestamps; attributes are a fixed list per class and never a PAN, an IBAN or an NI number. **Budget.** `budgetTokens × 4` characters, cut at a line boundary, with the note.

**The desks' hook** (`fs-bank/src/context.ts`, `bankContextRecords(extra, level, spec)`): `relational` adds the customer's related records from `bankRecords(extra.bank).hidden` — customer, accounts, recent activity, complaints, the bureau summary — the special-category ones dropped; `ontology` adds one `knowledge-card` record (`kind: 'knowledge-card'`, `classification: 'personal'`, `fields: { root, depth, scope, text }`). The Advice, Complaints, Fraud and Lending desks set `context: (level, generated, spec) => bankContextRecords(generated.extra, level, spec)`; the Front Desk has no bank and no hook.

## 6. The campaign axis (`@craftabot/evals`, stage D)

`campaignSchema.contexts?: ContextSpec[]`; the cells multiply by context; the world is built with `config.context` (an injected world, a plain one, a book cell's journey); a cell carries `context` only when the campaign named contexts, so a campaign without them is byte-identical to today's report; the slice key, the case table, the cohort rows and the scorecard carry the axis; `gateWhereSchema.context?`. A `parity` gate across `context` is legal.

## 7. Tests (WP81's DoD)

- The superset property per rung on the Front Desk and the four bank desks, through `checkDesk` in the packs' contract tests.
- The tenet-13 sweep: `knowledgeCard` and the `graph` line at every purpose never carry a special-category class's instance or a `discloses` edge for `lending`, `fraud-operations`, `reception`; do for `advice` and `complaints`.
- A knowledge card byte-stable per seed and depth; the budget truncates deterministically with the note.
- The Advice Desk's `data-minimised` fails a `relational` build on the plain savings case (context handed over accounts and activity the question did not need) and passes `minimal`.
- A two-context campaign's report carries per-context slices; a campaign without `contexts` is byte-identical to today's.
- The Playground page draws the tenth line on the Boundary.

## 8. Divergences from `64-…` §6.3

- `ContextSpec.delivery` defaults to `sense`, and `sense` is a built-in the runtime declares on any desk with a `context` hook — a desk whose senses each read one record (the Lending Desk) would otherwise never see the rung. `brief` appends to the desk brief where one exists; `line` is the graph line, always present on a bank desk.
- Special-category records never enter by context for any purpose (the desk reveals them by handler, as today) — stricter than "purpose-gating unchanged", and simpler to prove.
- The report's `schemaVersion` does not move (the design said "but for `schemaVersion`"): the cell's `context` is written only when the campaign named contexts, so a campaign without them is byte-identical outright. Version 3 is WP82's.
- The `ontology` rung carries the `relational` records beside the card (the design's table had the case file and the card alone): the ladder's superset property holds by construction, and a bot handed the graph is never handed less than a bot handed the records.
- `Application` and `Decision` instances come from the lending desk's state when the case is a lending one (`extra.lending`), not from the bank — the bank has no application of its own until the clock (WP83).
