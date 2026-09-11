# `@craftabot/harness`

The headless host (`docs/design-day2/26-TARGET-DESIGN-V3.md` §6.8, WP37): run a bot, keep the evidence, report on it — from a Node process and the `craftabot` CLI, against the same contracts the browser uses. The browser is _a_ host, not _the_ host.

```bash
npm run build                                  # the CLI runs from dist
npm run craftabot -- packs
npm run craftabot -- run --kit packages/harness/fixtures/snackbot.craftabot.json --card starter/snack --seed 7 --out ./runs
npm run craftabot -- report --safety-case --out ./runs
npm run craftabot -- report --incidents --out ./runs
npm run craftabot -- assurance --agent <id> --out ./runs --html ./assurance-pack.html   # WP67: the evidence, filed
npm run craftabot -- fork --run <runId> --tick 2 --kit other.craftabot.json --out ./runs   # WP66: the counterfactual, run
npm run craftabot -- bundle --run <runId> --out ./runs --file trace.craftabot-trace.json
npm run craftabot -- campaign --file campaigns/injection-baseline.json --strict --out ./campaign-out \
    --junit ./campaign-out/junit.xml --sarif ./campaign-out/results.sarif --markdown ./campaign-out/scorecard.md
```

## Campaigns

A campaign (`docs/design-day2/28-CAMPAIGNS.md`) is scenarios × builds × guards × brains × seeds with gates — a guardrail regression suite as a file. `craftabot campaign` runs one and writes `<reportId>.campaign-report.json` plus the renderings you name (markdown for a person, JUnit for CI, SARIF for code scanning), and keeps every cell's run under `--out/runs` so a failed gate's run ids open with `bundle`. At scale (WP68, `57-HARNESS-AT-SCALE.md`): `--jobs <n>` runs cells in a pool of worker threads (the report is placed by cell order, so it reads the same as `--jobs 1`); `--shard i/n` runs the i-th of n slices and `craftabot merge --file <campaign.json> <report.json>…` folds the shards back with the gates over the whole (refusing different campaigns, overlapping shards and a fold over the budget); `--seeds a-b` replaces the file's seeds; `--resume` reuses every cell a stopped run finished whose run still verifies (`<out>/cells.jsonl`) and runs the rest; `craftabot index --rebuild --out <dir>` rewrites the store's `index.jsonl`, which a listing reads instead of opening every run directory. `--strict` exits 1 on any failed gate; that is what CI runs on `campaigns/injection-baseline.json` and, since WP60, `campaigns/fs-advice-baseline.json` (the Advice Desk's thirty conduct scenarios under four guards) and, since WP62, `campaigns/fs-fraud-baseline.json` (the Fraud Desk's seventeen, with the first confusion matrix and parity gate) and, since WP63, `campaigns/fs-lending-baseline.json` (the Lending Desk's sixteen, with the first matched parity gate over the fairness pair). A live brain needs the campaign's own `budget` and its provider's credential.

`craftabot campaign --matrix scripted|expert [--out dir] [--record] [--strict]` is the one thing a campaign file does not do — an ad-hoc matrix with no gates, scored and diffed against a baseline in `--out` — and is what `npm run evals` now runs (WP56; it replaced `@craftabot/evals`' own CLI, which duplicated this host). The committed baselines live in `packages/evals/baselines/`; `--record` rewrites one, summaries only.

## What a run writes

One directory per run under `--out` (default `./runs`, gitignored):

```
runs/<runId>/run.json                         RunRecord — derived from run.started, as the Play route derives it
runs/<runId>/events.jsonl                     one StoredEvent per line, in seq order
runs/<runId>/summary.json                     RunSummary — the fold the Workshop's screens read
runs/<runId>/<runId>.craftabot-trace.json     the export the Workshop's Run Browser imports; digest verifies
agents/<agentId>.json                         the bot the kit described
```

The store (`createFileStorage`) implements the same `Storage` contract as the browser's IndexedDB and memory stores and passes the same conformance suite, so nothing here needs converting to be read there.

## Brains

- `--brain scripted-optimal` (default) — the plan the starter pack's solvability suite proves; no key, reproducible.
- `--brain scripted-noisy --seed N` — that plan with a seeded amount of wrongness (`@craftabot/evals`' own tier).
- `--brain live` (or `--provider <id>`) — the kit's own cartridge and its provider, with the key from the environment.

The scripted brains only know cards with a plan (the starter pack's); anything else needs `--brain live`.

## Credentials

**The principal** (WP65, `55-PRINCIPAL.md` §4.2). Every run, fork and campaign cell the harness starts carries `{ kind: 'service', id: 'craftabot-harness', name }` on `run.started`, on every action's attestation and as the `by` of every approval it answers — `name` from `--principal <name>`, else `CRAFTABOT_PRINCIPAL`, else the machine's hostname. Nothing is verified; the trace records what the host said.

Read only from `CRAFTABOT_CREDENTIAL_<ID>` — `<ID>` the provider or brick credential id, upper-cased, non-alphanumerics folded to `_` (`CRAFTABOT_CREDENTIAL_OPENAI`, `CRAFTABOT_CREDENTIAL_GEAP`). Never from a file the harness wrote, never printed, and every file it writes is redacted against every secret it holds. `key-leak.test.ts` plants one secret per declared credential and sweeps.

## Packs

The default pack list is every workspace pack bar the Kit's own demo pack. To use a different list, `--config craftabot.config.mjs` — a plain ES module whose default export is `{ packs: PackManifest[] }`. Nothing is discovered.

## Not allowed to depend on

Svelte, SvelteKit, `apps/workbench` — the harness is a host beside the workbench, never over it.

## A visitor across the desk (WP55)

`craftabot run --kit <desk-bot.craftabot.json> --counterpart scripted` seats a
second robot across a desk card: the kit's bot is the clerk, a generated
visitor plays the desk's own `CounterpartScript` through the
`scripted-counterpart` brain (no key; the merged stream reproduces from
`--seed`), and the episode is written as each member's run, the group's
record and stream, and a `<groupRunId>.craftabot-bundle.json` the Workshop
imports. `--counterpart live [--counterpart-cartridge <id>]` gives the visitor
a cartridge instead, with the script's persona as its personality;
`--max-rounds <n>` caps the episode (default 30). A room refuses the flag.
`--stack <guardId> --stack-file <campaign.json>` (WP64, `56-LIVE-COUNTERPARTS.md`
§4.3) installs a campaign guard's `group` half on the episode — the Watchbot's
rules and the breakers on the desk's own evaluators; every desk baseline carries
one as `compliance-watchbot`. On the bank's desks the visitor is the case's own
person, generated with the case and read from the world the harness makes
(`56-…` §2 item 10). `npm run smoke:counterpart` runs one Advice Desk case with a
live seat on OpenAI under that stack — an env key, never CI.

A campaign seats a live counterpart with `"counterpart": { "tier": "live",
"cartridgeId": "…" }` under a `budget` (every cell is then a live cell); its
report and every cell say which instrument they are, and a `no-regression`
gate against a baseline of the other tier says _not comparable_.

## Recording a service line (WP58)

`craftabot record --line <lineId> --script calls.json [--out ./cassettes]`
runs a line's `live` client once per `{ "op", "args" }` in the script, under
an egress guard that allows the line's own declared hosts and nothing else,
and writes a `<line>.craftabot-cassette.json` redacted against every
`CRAFTABOT_CREDENTIAL_*` the process holds. A pack ships the cassette under
`src/cassettes/` and sets `line.cassette`; a session replays it by operation
and argument digest and never calls out — a miss is `error.kind:
'cassette-miss'` on the trace. The report says whether the first response
carried `access-control-allow-origin: *`, the browser checkpoint. `--egress
none` refuses every call.

## The evidence store (WP70)

`craftabot evidence push --store <storeId> [--store-config <json>] --run <id> | --group <id> | --campaign-report <id> | --assurance [--agent <id>] | --content-file <record.json>` sends one artefact to a shared evidence store (`58-EVIDENCE-STORE.md`; `docs/evidence-setup.md`) and prints the receipt; `craftabot evidence pull --store … [--kind …] [--id …] [--since <iso>] [--limit <n>] [--dir ./evidence]` verifies every item's digest, refuses one that fails (exit 1) and writes the rest under `--dir/<kind>/…` as the files the Workshop imports. `evidence/supabase` reads its workspace token from `CRAFTABOT_CREDENTIAL_EVIDENCE_SUPABASE` and takes `{"url","anonKey","workspace"}` as its config; `evidence/memory` needs nothing and is for seeing the flow. The store's host is declared as egress; under `--egress none` the command is refused before any call. A sync target for artefacts only — never a key, never the source of truth, never required.

## Workflows (WP79)

`craftabot workflow run --workflow <id> --item <item.json> [--config <name>] [--kit <bot.craftabot.json>] [--brain …] [--seed <n>] [--decide <stageId>=<option>,…] [--deny] [--egress declared|none] [--out ./runs]` runs one workflow a pack ships (`69-WORKFLOWS.md`) over one work item — a `WorkItem` as `docs/schemas/book.schema.json` has it — stage by stage: a `rule` executor performs the call a pure function chose, an `agent` executor seats `--kit`'s bot on a card synthesised for the stage (its plan looked up by the stage card's id, `<workflowId>/stage/<stageId>`, so a pack's `testing` plans answer for its workflows), a `human` executor takes `--decide`'s answer for that stage or the executor's default, a `line` executor calls the service line's tool. `--config` picks one of the workflow's named configurations. Every agent run is written exactly as `run` writes a run; the workflow's own record — every stage's executor, input and output digests, guard tally and status, its events, a digest over the stage records — is `<out>/workflows/<runId>/workflow-run.json` (`docs/schemas/workflow-run.schema.json`). Exit 0 when the journey completed, 1 when a stage stopped it.

## Books and sweeps (WP80)

`craftabot book run --workflow <id> --population <seed> --size <n> [--config a,b,…] [--kit <bot>] [--brain …] [--period-days <n>] [--limit <n>] [--jobs <n>] [--egress …] [--markdown <scorecard.md>] [--out ./campaign-out]` runs a book through a workflow's configurations (`64-…` §6.6.3; `73-…` §5): the workflow draws its book from a population at the seed and size (`WorkflowSpec.book`), one build per configuration named — every named one by default — with `--kit`'s bot or the world's default senses and actions, one guard, one brain; the campaign is written as `<out>/<id>.campaign.json` beside the report and run as `campaign` runs one (the pool under `--jobs`, every run kept, the report's human-load rows printed). Its one gate always passes: a book run is a measurement, and the gates a judgment needs come in a campaign file with `source: { kind: "book", workflowId, population | book, configuration?, limit? }` — `craftabot campaign --file` runs one of those exactly as it runs a scenario campaign, `campaigns/fs-lending-book.json` being the one CI runs. `craftabot sweep --file <campaign.json> --knob <name>=<v1>,<v2>,…` is sugar over builds: every build × every value, one build per value named `<build>@<knob>=<value>`, written beside the report and run.

## A day at the bank (WP83)

`craftabot bank run --day <YYYY-MM-DD> --desks <desks.json> [--population <seed>] [--size <n>] [--acceleration <n>|inf] [--brain scripted-optimal|scripted-noisy] [--stop-after <n>] [--egress …] [--out ./runs]` runs one simulated day (`71-THE-CLOCK.md`): the population at the seed and size (2,000 by default), the day's books drawn — the loan book through each desk workflow's own `book`, the alert book, the complaint and advice-request registers — the clock over them at the acceleration (`inf` by default: as fast as it can), and the desks from the file, `[{ id, workflowId, kinds, configuration?, knobs?, concurrency, build?, kit? }]`, each working the kinds it names through its workflow up to its concurrency, routed by kind to the first desk that takes it. Every agent run is written exactly as `run` writes one; every workflow run as `<out>/workflows/<id>/workflow-run.json`; the day as `<out>/bank-runs/<id>/bank-run.json` (`docs/schemas/bank-run.schema.json`) — the clock's options, the desks, the counts by kind and desk, the incidents, every run's id and digest in arrival order, a digest over those, and the wall time outside the digest. Two days from one seed are the same bytes at any concurrency and any acceleration; `campaigns/desks/lending-day.json` is the desks file CI runs, one lending desk at concurrency 4.
