# 45 — Truth and the synthetic sweep (WP54): what was actually so, and nothing real

> **Status:** design of record for WP54 (`42-DAY4-ROADMAP.md` Phase M), written 2026-09-05 against the codebase as it stands after WP57 (`main` at `76d139b`). This is the map for `41-TARGET-DESIGN-V4.md` §6.2 and the synthetic-data half of §6.13; where the two differ, §8 below says why and `41-…` §12 gets a dated note when the stage lands. The roadmap had reserved `45-` for the bank's note (`42-…` §3 WP59, §8 item 8); this note takes the number because it lands first, and the bank's becomes `46-`, the Advice Desk's `47-` — recorded in `42-…` §8.

---

## 1. Purpose, and who this is for

Two things, one seam. **Truth:** a desk keeps facts the bot must never see — whether the visitor really is expected, which alert really is fraud, what the customer's actual capacity for loss is — and the evaluators must read exactly those facts to say whether the bot got it right. Today nothing in the engine can hold a fact the trace does not eventually show, and `EvaluationInput` is the run, its events and a scenario (`41-…` §6.2, G24). **Synthetic:** the first fixture with a person in it is the first that could be a real one (`41-…` tenet 15, G34). The bank (WP59) will generate thousands; the primitives it generates from, and the sweep that refuses anything that looks real, have to exist before the first customer is typed.

This note is for the desk authors of WP59–WP63 (every desk's `truth` block and every generator go through what is built here), for anyone writing an evaluator that reads truth (`reads: ['truth']` is the whole ceremony), and for the reviewer who wants "nothing real" to be a test rather than a promise.

## 2. Where the code actually is (the load-bearing facts)

Verified against `main` at `76d139b`.

**The world contract.** `packages/core/src/types/world.ts` line 109: `WorldInstance { snapshot, observe, perform, test, reset, receiveInput?, describeProgress?, inject? }`. A session creates its world at `session/agent-session.ts` line 129 (`deps.world ?? createWorld(goalCard)`) with `{ random }` (WP53); a group's root world at `session/session-group.ts` line 96.

**`run.finished`.** `schemas/events.ts` lines 112–125: `{ outcome, ticks, usage, reason? }`. Emitted once, from `finish()` at `agent-session.ts` line 500, after `disposeRuntimes`. `projection/run-projection.ts` line 155 folds it into `outcome` and `finishedReason`; `RunProjection` (line 25) carries `world`, `outcome`, `events` and the rest.

**The evaluator contract.** `types/evaluator.ts`: `EvaluationInput { run, events, group?, scenario? }`; `Evaluator { id, name, description, kind, configSchema?, credential?, egress?, evaluate, createOffline? }`. `evaluationInputFor(events, run?, scenario?)` in `packages/governance/src/evaluators.ts` line 112 builds the input from a trace. **Every place an evaluator is run** — six: `evals/src/scenarios.ts` line 149 (`runScenario`), `evals/src/campaign.ts` line 639 (a campaign cell's verdicts), `harness/src/commands/evaluate.ts` line 96 (`craftabot evaluate`), `apps/workbench/src/lib/workshop/evaluations.ts` line 73 (the Workshop's evaluate button), `packs/workshop/src/bricks/monitor-judge.ts` line 92 (the Monitor Judge over `ctx.history`, mid-run), and `pack-testkit/src/checks/evaluator.ts` line 43 (`checkEvaluator`, run by `describeConformance` for every evaluator a manifest ships). All six build the input from `evaluationInputFor` or hand a fixture's inputs in.

**The desk runtime.** `packages/desk/src/desk-world.ts`: `buildState(layout, seed)` (line 170) generates a `DeskCase` from `layout.case(seededRandom(seed))` and copies `revealed`, `hidden`, `queue`, `alerts`, `extra` into a `DeskState`; `snapshot()` (line 397) is `structuredClone(state)` — **so `hidden` rides `world.changed` today**, which is fine for `hidden` (a look-up reveals it; the UI never shows it) and would be wrong for truth. `reset()` rebuilds from the seed. `observe` (line 309) assembles the three built-in senses and any custom `reveal(state)`. `test-desk.ts` is the two-record desk the golden trace runs on; `testDesk` has no truth and the golden (`fixtures/trace.desk-minimal.v1.json`) must stay byte-identical.

**`checkDesk`** (`pack-testkit/src/checks/desk.ts`): view, tiers, purity under throwing stubs, injections, `desk.purpose-classification` ("the first cut — WP54's truth property is the real gate"), reset. `DeskConformanceFixture { layoutIds?, purpose?, acceptedInjections?, scripts?, illegalActions?, volatileStateKeys? }`. The testkit has no seeded PRNG of its own; `world.create(layoutId)` with no options uses the desk's `DEFAULT_SEED`.

**The flap.** `components/control-room/CaseFile.svelte` already takes `truth?: readonly DeskRecord[]` and draws `<details data-testid="desk-truth">` with `desk-truth-{id}` articles behind `--cab-truth` (WP57 stage B). Nothing passes it. `DeskView` takes `world` and `outcome`; `WorldStage` chooses it by shape; the Run Lab calls `WorldStage` at `routes/workshop/runs/[runId]/+page.svelte` line 362 with `shown` = `projectThrough(events, tick)`; the Kit's Play route calls the same `WorldStage`.

**The sweeps that exist.** `apps/workbench/src/lib/state/key-leak.test.ts` (plant a key, run, export, sweep) and `packages/harness/src/key-leak.test.ts` (plant per credential, run and bundle, sweep every file written and every line printed). Both are unit tests, so CI's test job is where "beside the key-leak test" means. **The fixture estate the synthetic sweep must pass over:** `packages/core/src/fixtures` (22 JSON), `packs/geap/src/fixtures` (11 + 6 eval), `packs/guard-local` (6), `packs/azure-content-safety` (6), `packs/pdp-opa` (3), `packs/starter` (1), `evals/baselines` (4), `harness/fixtures` (1), `desk/src/fixtures` (1), `campaigns/injection-baseline.json` — traces, cassettes, scenarios, baselines. They carry event ids, timestamps in milliseconds, token counts and UUIDs: anything that flags a thirteen-digit number is unusable.

**Hard rule 9.** `CLAUDE.md` stops at rule 8; `10-…` §8 item 7 is the placeholder the docs pass added ("nothing real, ever … pending WP54").

## 3. Design principles

1. **One field, one event, end of run.** Truth crosses onto the trace once, on `run.finished`, after the last decision, and nowhere else — not on `world.changed`, not in a sense, not in `describeProgress`, not in a prompt. A test counts.
2. **Truth is held beside the state, not in it.** The desk runtime keeps the case's truth in its closure; `snapshot()` never sees it. What cannot be cloned cannot leak.
3. **An evaluator says what it reads.** `reads: ['truth']` on the definition; the gate is applied where an evaluator is *run*, in one helper, so a caller cannot forget it and a fixture cannot bypass it.
4. **Tenet 13 is a property, not a review note.** Over a hundred seeds, no sense's text contains a value that only truth knows.
5. **Synthetic by construction, refused by shape.** The primitives cannot produce a real identifier (Luhn fails by construction; the check digits are impossible; the prefix is the dummy one; the domain is reserved), and the sweep refuses the shapes real identifiers have. Two independent lines; the sweep is the floor.
6. **No false positives on the estate we have.** The sweep is tuned against the fixtures in §2 before it gates: a card number needs a known issuer prefix *and* a Luhn pass; a sort code is flagged only where a key names it; an IBAN needs valid check digits. The planted-PAN test proves the sweep still bites.
7. **The Kit never opens the flap.** Truth is a Workshop instrument; the Play route's `WorldStage` is never handed it.

## 4. The design

### 4.1 `truth` in core (stage A)

```ts
// types/world.ts — additive
export interface WorldInstance {
  …
  /**
   * What is actually so in this world, for evaluators only (`41-…` §6.2, tenet 13).
   * Never composed into a prompt, never revealed by a sense, never on the trace
   * as an observation. Read once, by the session, as the run finishes; a world
   * with nothing hidden omits it.
   */
  truth?(): unknown;
}

// schemas/events.ts — additive
run.finished: { outcome, ticks, usage, reason?, truth?: unknown }
```

`finish()` reads `world.truth?.()` after `disposeRuntimes` and spreads it into the payload only when defined (an `undefined` never becomes a `"truth": null` in a trace). Every seat of a group calls its own `finish()` over the shared root world, so each seat's `run.finished` carries the same truth — a bundle reader needs no join. `RunProjection` gains `truth: unknown` (set from the event, `undefined` before it); nothing else in the projection changes, so a projection *through* a tick before the end has no truth, which is what the Run Lab's flap needs.

`EvaluationInput.truth?: unknown` — "the world's `truth()` at the end of the run, when the world has one". `Evaluator.reads?: Array<'truth'>` — a literal union of one member today so WP55's `counterparts` or a later `hidden` can join it without a shape change.

**The gate.** `evaluationInputFor(events, run?, scenario?)` now also lifts `truth` from the last `run.finished` (there is one per run; a `ctx.history` mid-run has none, so the Monitor Judge never sees truth whatever it declares — an evaluator run during a run judges what the bot could know). Beside it, `inputReadableBy(evaluator, input)` returns the input with `truth` **deleted** unless `evaluator.reads` includes `'truth'`. All six call sites of §2 go through it, including `checkEvaluator`, whose fixture inputs may carry truth; `checkEvaluator` gains two checks: `evaluator.reads-truth` — an evaluator declaring `reads: ['truth']` is handed a fixture input with truth and its result differs from the same input with truth removed (proof it reads it, not proof it is right); and `evaluator.truth-hidden` — an evaluator that does not declare it is run on an input whose truth is a planted sentinel, and the sentinel never appears in the result. The second is the tenet-13 half for evaluators: an undeclared reader cannot reach truth because the helper removed it, and a test proves the helper is on the path.

`npm run schemas` regenerates `docs/schemas/craftabot-trace.schema.json` (`run.finished.truth` is `{}` — any JSON — under draft 2020-12), and `02-…` §7's catalogue gains the field.

### 4.2 The desk's truth (stage B)

```ts
// @craftabot/desk
export interface DeskTruth {
  /** Records the evaluators alone may read, in `DeskRecord` shape so the flap draws them. */
  records: DeskRecord[];
  /** Plain facts with no record shape — a label, a band, a flag. */
  facts?: Record<string, string | number | boolean>;
}
export interface DeskCase<Extra> { …; truth?: DeskTruth }
```

`buildState` returns the state and the truth as two values; the runtime keeps `truth` in the closure beside `state`, `reset()` rebuilds both from the seed, and `truth()` is defined on the instance only when the case produced one (`'truth' in instance` is then honest for the golden desk, which never does). `DeskActionContext` does **not** expose truth: a handler that could read truth could reveal it, and `ctx.find` searches revealed and hidden only. A desk that needs a handler to act on a true fact keeps that fact in `hidden` (a look-up can reach it) and its *label* in truth. This is the line between `hidden` and `truth` `43-…` §4.4 drew: hidden is what the bot may earn; truth is what nobody at the desk can see.

**The test-only desk.** `testDesk` stays exactly as it is — the golden trace's oracle. A second spec, `truthfulTestDeskSpec`, extends it with a `truth` block on the same layout (`{ records: [{ id: 'visitor-truth', kind: 'visitor', title: 'Visitor (truth)', classification: 'personal', fields: { name, expected: <the real answer, drawn from the seed> } }], facts: { outcome: 'admit' | 'refuse' } }`), and the runtime's tests prove: `truth()` returns it, `snapshot()` never contains it, `observe` over every sense never contains a truth-only value, `reset` gives the same truth, and a session over it writes `run.finished.truth` once (the core test of §4.1 runs on a stub world; this one runs on the real runtime).

**The Front Desk** (`pack-workshop`) gains a small truth — whether the visitor really is on the list, a `visitor-truth` record and `facts.expected` — so the Workshop has a real desk with a flap to open and WP55's counterpart has a fact to lie about. Its e2e reads the flap after a run ends.

### 4.3 The tenet-13 property in `checkDesk` (stage B)

`desk.truth-never-sensed`: for seeds 1..100, `world.create(layoutId, { random: seededRandom(seed) })` (the testkit gains a copy of mulberry32 — eleven lines, kept in `checks/desk.ts`, so the kit does not depend on `desk`); if the instance has no `truth`, the check passes trivially and says so once. Otherwise the check collects **truth-only values**: every string, number or boolean leaf of `truth().records[*].fields`, `records[*].title` and `truth().facts`, stringified, at least three characters, that does not also appear as a leaf of any revealed or hidden record's fields or title (a fact the bot can earn is not a secret). It then observes every sense the desk declares, at the opening and after each fixture script's actions, and fails naming the sense and the value if any observation text contains a truth-only value. The same values are checked against `describeProgress` for every predicate over every channel. Numbers under three characters and booleans are compared as whole JSON tokens against the record fields rather than as substrings — `true` appears in most sentences' worth of JSON.

`desk.truth-not-in-snapshot`: `JSON.stringify(snapshot())` contains no truth-only value, at the opening and after the scripts.

`checkDesk`'s `desk.purpose-classification` keeps its first cut; the property is the real gate, as it said.

### 4.4 The Run Lab's flap (stage B, Workshop only)

`WorldStage` and `DeskView` gain `truth?: unknown`. `DeskView` narrows it with a local guard (`records` is an array of things with `id`, `kind`, `title`, `fields`) and hands the records to `CaseFile`'s existing prop, plus renders `facts` as a definition list inside the same `<details>` (`desk-truth-fact-{key}`). The Run Lab passes `shown.truth` — set only by a `run.finished` inside the scrubbed range, so scrubbing back before the end closes the flap. The Kit's Play route passes nothing, and a test over the route's source proves the prop is absent (`grep` in a unit test, the way `hard rule 1`'s import test works). `WorldView` (the grid) ignores it. No new tokens: `--cab-truth` and the flap's styling landed in WP57.

### 4.5 The synthetic primitives (stage C, `@craftabot/desk`)

`packages/desk/src/synthetic.ts`, every function `(random: () => number) => …`, pure, seed-stable:

| Primitive | Produces | Why it cannot be real |
|---|---|---|
| `syntheticName(random)` | `{ given, family, full }` from two corpora (~40 given, ~40 family), deliberately plain and mixed | A corpus of forty and forty is a name space of 1,600; a coincidence with a real person is a coincidence, and the sweep does not look for names (§8) |
| `syntheticPan(random)` | 16 digits, issuer prefix `4` or `5`, spaced in fours | The last digit is chosen so the Luhn sum is **off by one**; every real card number passes Luhn |
| `syntheticAccountNumber(random)` | 8 digits | Meaningless without a sort code; the sort code is the guard |
| `syntheticSortCode(random)` | `99-9x-xx` | The `99` range is not allocated to any clearing bank; the sweep treats `99-` as the reserved prefix |
| `syntheticNiNumber(random)` | `QQ 12 34 56 A` shape | `QQ` is the prefix HMRC never issues and its own examples use |
| `syntheticIban(random)` | `GB00 CABX 9999 xx…` | Check digits `00` are impossible under ISO 13616 (mod-97 never yields 00, 01 or 99); `CABX` is no bank's code |
| `syntheticEmail(random, name?)` | `<given>.<family>@example.com` (or `.org`/`.net`) | RFC 2606 reserves the `example.` domains |
| `syntheticPhone(random)` | `07700 900xxx` or `020 7946 0xxx` | Ofcom's drama ranges, reserved from allocation |
| `syntheticAddress(random)` | `{ line1, town, postcode }` on a fictional street set, town from a fictional list, postcode `ZZ99 9ZZ`-shaped | `ZZ` is not a UK postcode area; the streets and towns are invented |

Each has a test that a thousand draws never produce a shape the sweep would refuse — the two lines of principle 5 checked against each other.

### 4.6 `checkSynthetic` and the sweep (stage C, `pack-testkit`)

`checkSynthetic(files: Array<{ path: string; text: string }>): ConformanceIssue[]`, one issue per hit, `check` naming the shape, `message` naming the file, line and a masked excerpt (the sweep must not print what it found). The shapes, tuned against the estate in §2:

| Check | Shape | Refused when |
|---|---|---|
| `synthetic.pan` | 13–19 digits with optional single spaces or dashes between groups, beginning with a known issuer prefix (`4`; `51`–`55`; `2221`–`2720`; `34`, `37`; `6011`, `65`; `35`) | Luhn passes |
| `synthetic.iban` | `[A-Z]{2}\d{2}[A-Z0-9]{11,30}` with the country's length (GB 22, DE 22, FR 27, NL 18, ES 24, IE 22, IT 27, BE 16) | mod-97 check passes |
| `synthetic.sort-code` | a JSON key matching `/sort.?code/i` whose value is `\d\d-?\d\d-?\d\d` | the first pair is not `99` |
| `synthetic.ni-number` | `[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z] ?\d\d ?\d\d ?\d\d ?[A-D]` | the prefix is not `QQ` and not one HMRC never issues (`BG GB NK KN TN NT ZZ`) |
| `synthetic.email` | an address | the domain is not `example.com/.org/.net`, `*.example`, `*.test`, `*.invalid`, `*.localhost` |
| `synthetic.phone` | a UK mobile `07\d{3} ?\d{6}` or London `020 ?\d{4} ?\d{4}` | not in the drama ranges |

The issuer-prefix rule is what keeps event ids, timestamps and token counts out: no fixture number begins `4…` and passes Luhn today, and one that does is either a card number or a coincidence a reviewer can rename. The domain rule is an allow-list because "resolves" (`41-…` §6.13) needs a network CI does not have; a fixture address on a real-looking domain is refused whether or not it resolves (§8).

**The sweep** (`pack-testkit/src/synthetic-sweep.test.ts`) walks `packages/**` and `campaigns/**` for `*.json`, `*.jsonl`, `*.md` and `*.ts` files under any `fixtures/`, `baselines/`, `cassettes/`, `scenarios/` or `corpus/` directory, plus every `campaigns/*.json`, skipping `node_modules`, `dist`, `coverage` and `__snapshots__`, and asserts no issue. A second test plants a Luhn-valid Visa number in a temporary file and asserts `checkSynthetic` refuses it, so a sweep that stops biting fails the build. `describeConformance` does not run `checkSynthetic` (a pack's fixtures are files, not manifest content) — the sweep is repo-wide, once.

### 4.7 What the trace says

`run.finished.truth?` — the one new field; `02-…` §7 gains it with the sentence "the only event that ever carries truth". No new event type. `world.changed` is unchanged and, for a desk, provably free of truth (§4.3).

## 5. UX trajectory

The flap opens in the Run Lab when the scrubber reaches the end; it says "Case file (truth) — what was actually so" and lists the truth records like any other, behind the plum dashed border, with the facts beneath. Compare (two runs) shows two flaps. The Kit shows nothing, ever. A campaign report and the assurance pack (WP67) will quote truth-backed verdicts; that is theirs.

## 6. Determinism

Truth is generated from the same seed as the case, by the same `layout.case(random)` call, so a reset, a replay and a campaign cell agree on it. `truth()` returns a `structuredClone` each time; the session reads it once. The property runs on a hundred fixed seeds. The primitives draw from the `random` they are handed and nothing else, and the desk's purity check (throwing `Date`/`Math.random`/`crypto`) covers them when a desk uses them in `case`.

## 7. Non-goals (recorded so they are decisions)

- No name sweep: a name corpus cannot be told from a real name by shape; the guard is the primitive and review.
- No truth in `ToolContext` or `GuardrailContext`: a tool or a rule that could read truth could leak it; WP58's service lines read `hidden` through the desk.
- No truth redaction on export: truth is synthetic by tenet 15, so the bundle carries it (`41-…` §6.2).
- No `truth` on `group.finished`: each seat's `run.finished` has it.
- No live "resolves" check on email domains; an allow-list (§4.6).
- No sweep over source code for names; the sweep reads fixtures, cassettes, scenarios, corpora and campaigns.

## 8. Divergences from `41-…` §6.2 / §6.13, with reasons

| `41-…` says | This note does | Why |
|---|---|---|
| §6.13: the bank's note is `45-FS-BANK.md` (`42-…`) | This note is `45-`; the bank's is `46-`, the Advice Desk's `47-` | WP54 lands first and the numbers are the order the notes are written |
| §6.2: `checkEvaluator` "an evaluator declaring `reads: ['truth']` receives it and one that does not never sees it" | Two checks, and the gate is a helper on every run path, not only the kit's | The kit can only prove its own path; the helper is what makes the other five honest |
| §6.13: "email domains that resolve" | An allow-list of reserved domains | No network in CI; a real-looking domain is refused whether or not it resolves |
| §6.13: "real UK sort-code ranges" | Any sort code not in the `99-` reserved prefix, and only under a key naming it | Real ranges are a moving table; the reserved prefix is the invariant, and dates look like sort codes |
| §6.13: sweeps "every fixture, cassette, scenario and corpus file" | Those directories plus `campaigns/*.json`; source files only under a `fixtures/` directory | The estate's TS fixtures (`geap/src/fixtures/eval/index.ts`) are fixtures too |
| §6.1: `truth.describe` mentioned by the property | No `describe`; the property derives truth-only values from the truth's own leaves | A hand-written `describe` is a second list to keep in step with the first |
| §6.2: the Desk view shows truth "under a flap the Kit never opens" | The Kit's `WorldStage` is never handed the prop, held by a test | Not opening is weaker than not having |

## 9. Risk register

| Risk | Handling |
|---|---|
| A desk author puts truth into `hidden` and a look-up reveals it | The line in §4.2's doc comment; the property catches the value in a sense after a script that looks it up |
| The property's substring rule flags a common word | Values under three characters are token-compared; a truth field that is a common word is the author's to rename, and the message names it |
| The sweep flags a legitimate number in the estate | Tuned against the estate before it gates (issuer prefix + Luhn; keyed sort codes; length-checked IBANs); the run in stage C reports every hit before the assertion is turned on |
| The sweep stops matching after a refactor | The planted-PAN negative test |
| `run.finished.truth` changes a golden trace | Neither golden world has truth; `testDesk` is untouched; the truthful desk is a second spec |
| The JSON schema gate fails on the new field | `npm run schemas` in stage A; `truth` is `{}` |

## 10. Implementation plan

Stage-gated as ever; every stage on the full gate; one dated note here per stage.

**Stage A — truth in core and the gate.** `WorldInstance.truth?`, `run.finished.truth?`, `finish()`, `RunProjection.truth`, `EvaluationInput.truth`, `Evaluator.reads`; `evaluationInputFor` lifting it and `inputReadableBy` beside it; the six call sites; `checkEvaluator`'s two checks with a reading and a non-reading evaluator in its own test; the core session test (exactly once, on no other event, on a stub world with truth; absent on a world without); schemas regenerated; `02-…` §7's row; `13-…` §7 and `14-…` §7 notes.

**Stage B — the desk's truth, the property, the flap.** `DeskTruth`, `DeskCase.truth`, the closure and `truth()`; `truthfulTestDeskSpec` and its tests; the Front Desk's truth; `checkDesk`'s two checks with the testkit's PRNG, proven on a hand-written leaking desk; `WorldStage`/`DeskView` and the Run Lab; the Kit-never test; `desk.spec.ts` reading the flap after the run ends; the desk golden unchanged.

**Stage C — synthetic.** `synthetic.ts` with its tests; `checkSynthetic` with its unit tests over each shape; the sweep test and the planted-PAN test; hard rule 9 in `CLAUDE.md` and `10-…` §8 item 7 made real; `README.md`'s row; `42-…` §8's close-out and the renumbering; `41-…` §12's rows.

## 11. Acceptance criteria (WP54 as a whole)

1. A core session test proves `truth` on `run.finished` exactly once and on no other event, and absent when the world has none.
2. `checkEvaluator` proves a `reads: ['truth']` evaluator receives truth and an undeclared one never sees a planted sentinel; the helper is on all six run paths.
3. `checkDesk`'s `desk.truth-never-sensed` holds on the truthful test desk and the Front Desk over 100 seeds and fails on a planted leaking desk.
4. A planted Luhn-valid PAN in a fixture fails the sweep; every existing fixture passes it.
5. The Run Lab opens the flap after a Front Desk run ends and the Kit's Play route cannot.
6. Both golden traces and the desk golden byte-identical; the trace schema regenerated and checked.
7. Hard rule 9 in `CLAUDE.md`; `10-…` §8 item 7 no longer a placeholder.

*(Stages append dated notes here as they land, per `10-…` §7.)*

> **Stage A landed 2026-09-05.** `WorldInstance.truth?()`, `run.finished.truth?` written by `finish()` after every brick is disposed and only when defined, `RunProjection.truth`, `EvaluationInput.truth?`, `Evaluator.reads?: EvaluatorReads[]`. `evaluationInputFor` walks the events backwards for the last `run.finished` (no `findLast` — the workspaces compile against ES2022) and `inputReadableBy(evaluator, input)` beside it *deletes* the key for an undeclared reader; all six run paths go through it — `runScenario`, a campaign cell, `craftabot evaluate`, the Workshop's `runEvaluator`, the Monitor Judge (whose `ctx.history` has no `run.finished` anyway) and `checkEvaluator`, which mirrors the helper in eleven lines because the kit is `core`-only. `checkEvaluator`'s two new checks proven against a peeking evaluator, a blindfolded one and the example pack's honest reader; `truth-on-finish.test.ts` in core proves exactly once, on no other event, absent (not null) without a world truth, and in the projection only once finished. `npm run schemas` added `"truth": {}` to the trace and bundle schemas; `02-…` §7, `13-…` §7 and `14-…` §7 carry the notes. Gate: root lint clean, 22 workspaces' suites green, build within budget with the schema check, default e2e 167/167, baseline campaign with no regressions, all three golden traces byte-identical (their worlds have no truth).
