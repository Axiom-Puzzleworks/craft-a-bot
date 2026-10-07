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

`craftabot evidence push --store <storeId> [--store-config <json>] --run <id> | --group <id> | --campaign-report <id> | --assurance [--agent <id>] | --content-file <record.json>` sends one artefact to a shared evidence store (`58-EVIDENCE-STORE.md`; `docs/evidence-setup.md`) and prints the receipt; The file store keeps a workflow run under `<out>/workflows/<id>/` — the bare `workflow-run.json` the `workflow`, `book` and `bank` commands write, and, when a store wrote it, `stored-workflow-run.json` with the item (WP86, `77-…` §3); the Workshop imports either on `/workshop/workflows`.

`craftabot evidence pull --store … [--kind …] [--id …] [--since <iso>] [--limit <n>] [--dir ./evidence]` (the kinds: `bundle`, `campaign-report`, `assurance-pack`, `content`, and since WP84 `workflow-run` and `bank-run`, the Monitor's ingest seam) verifies every item's digest, refuses one that fails (exit 1) and writes the rest under `--dir/<kind>/…` as the files the Workshop imports. `evidence/supabase` reads its workspace token from `CRAFTABOT_CREDENTIAL_EVIDENCE_SUPABASE` and takes `{"url","anonKey","workspace"}` as its config; `evidence/memory` needs nothing and is for seeing the flow. The store's host is declared as egress; under `--egress none` the command is refused before any call. A sync target for artefacts only — never a key, never the source of truth, never required.

## Workflows (WP79)

`craftabot workflow run --workflow <id> --item <item.json> [--config <name>] [--kit <bot.craftabot.json>] [--brain …] [--seed <n>] [--decide <stageId>=<option>,…] [--deny] [--egress declared|none] [--out ./runs]` runs one workflow a pack ships (`69-WORKFLOWS.md`) over one work item — a `WorkItem` as `docs/schemas/book.schema.json` has it — stage by stage: a `rule` executor performs the call a pure function chose, an `agent` executor seats `--kit`'s bot on a card synthesised for the stage (its plan looked up by the stage card's id, `<workflowId>/stage/<stageId>`, so a pack's `testing` plans answer for its workflows), a `human` executor takes `--decide`'s answer for that stage or the executor's default, a `line` executor calls the service line's tool. `--config` picks one of the workflow's named configurations. Every agent run is written exactly as `run` writes a run; the workflow's own record — every stage's executor, input and output digests, guard tally and status, its events, a digest over the stage records — is `<out>/workflows/<runId>/workflow-run.json` (`docs/schemas/workflow-run.schema.json`). Exit 0 when the journey completed, 1 when a stage stopped it.

`craftabot scaffold domain --id <id> --sector <sector> --jurisdiction <jurisdiction> --world <pack> --journeys <a,b> --out <dir> [--root <Entity>] [--name <name>] [--today YYYY-MM-DD] [--relative]` types out a domain pack's shape (`93-DOMAIN-PACK.md` §4): under `<out>/<world>/` the world pack — the root entity (`--root`, `Customer` by default) from a seed, a calibration table of stated assumptions every row `review: 'pending'`, three tiered service lines, the obligation vocabulary, a control map, a persona, the `DomainSpec` — and under `<out>/<journey>/` one journey pack per name: a desk with three actions and two predicates, a four-stage workflow with `rules-only` and Level 4 configurations, two scenarios and a card, a policy card, a deterministic evaluator, a book, a campaign, the scripted plans and a golden-run test. The output passes `checkDomainPack` as written and fails `checkCalibration({ requireReview: true })` until a reader cites a row — the first thing a domain author does. Each file goes through Prettier under the config `<out>` resolves when Prettier is installed. `--relative` writes one workspace (one `package.json` at the root, the journey packs importing the world by relative path) instead of a package per pack; `examples/scaffold-domain` is that, held byte for byte by `src/commands/scaffold.test.ts`.

## Readings (WP129)

`craftabot readings export [--format json|markdown] [--out <file>] [--store <dir>] [--blueprints <dir>]` writes the reading desk's queue (`108-READINGS.md`). Every subject shipped _pending_ is listed with its source and the reading it has had:

- catalogue entries, calibration rows, control rows and decision rights;
- blueprint items (from `--blueprints`, `docs/blueprints` by default);
- the bank's screening lists;
- error and reviewer models.

The readings are the `review` records, and the `control-review` alias, in the content directory (`--content`) and, with `--store`, in a run store. The markdown is the maintainer's work list: the amendments to edit in, the rejections, then the unread by kind. With `--out`, the terminal gets one readout per kind.

## The Control Inventory (WP134)

`craftabot packs lock [--check] [--file <packs.lock.json>]` writes every shipped pack's content digest (`packDigest`: its tool, action and sense descriptions, cards and stacks) to `packs.lock.json`. The default config pins every pack to it, and the registry refuses a pack whose content differs, so a poisoned tool description fails registration. `--check` exits 1 when the lock is stale. Rewrite it on purpose, after reviewing the change (WP141).

`craftabot benchmark run <benchmark.json> [--cassettes <dir>] [--record [--only <serviceId,…>]] [--out <dir>] [--store <dir>]` runs the adversarial benchmark (`106-BENCHMARK.md` §6). Each guard service answers from its cassette under `benchmarks/cassettes` when there is one, else from its offline stand-in, which measures nothing. `--record` calls the services live, each with its credential from the environment, and writes their cassettes. `--only` limits the live calls to the services named, so a keyless local service (Llama Guard through Ollama) can be recorded without calling every other keyless one (WP140).

`craftabot sensors list | export [--format json|markdown] [--out <file>] [--store <dir>]` folds the Sensor Inventory (`112-REAL-ENOUGH-PLAN.md` §5, WP159): every event type a run can carry, the part of the system that writes it, who reads it and its optional payload fields; with `--store`, how many of each the store holds. `/workshop/sensors` renders the same fold.

`craftabot recording verify --recording <file> --file <experiment.json> [--out <dir>] [--live-store <dir>] [--size <n>] [--config <file>]` holds a cell-scoped recording (WP190) to what it says: the design is replayed from the recording alone under `--egress none`, and every cell must answer every call it recorded from the prompts it recorded and finish on the path digest the live run had; with `--live-store` the recording is also held against the live run's own store. It names each cell diverged, off its path, unrecorded, missing or with recorded calls left unasked, and exits 1 on any. `craftabot record --experiment` writes the recording at each brain's `cassette` path and keeps the live run's own store under `--out`; `--trials n` performs each cell n times (WP191), `--trial i` records one trial alone into the recording already there, and `--cells text,text` keeps only the cells whose key contains one of the texts (the live smoke, `scripts/live-smoke.mjs`, WP194).

`craftabot reperform --recording <file> --file <experiment.json> --provider <id|mock> [--trials <n>] [--cells <text>] [--limit <n>] [--size <n>] [--concurrency <n|auto>] [--allow-drift] [--out <dir>]` performs a recording's cells again, live, with the same inputs (WP192), and compares the fresh performances with the original: how often the outcome and the first call repeated (the prompt at the first tick is the same, so a difference is the model's own), how soon and how far the paths forked. It is a measurement, not a check — a live model is not repeatable and nothing requires it to be. The design is rebuilt from the recording's manifest and refused, by campaign, if its digest has moved (`--allow-drift` says otherwise, and the report says so). `craftabot probe prompts --recording … --file …` takes real first-tick prompts from a recording (which stores only their digests) by replaying it; `craftabot probe determinism --cartridge <id> --prompts <file> [--repeat <n>] [--units <id,id|none>]` sends them over and over — at temperature 0, at 0 with a seed, and warm with a seed — to each Spark alone and to the pair, and reports how often an answer repeats, how soon two answers first differ, and whether a seed makes an answer repeatable. Outputs belong under `recordings/` (gitignored) or the scratch directory.

`craftabot story <runId | itemId> [--store <dir>] [--format markdown|html|json] [--out <file>] [--no-follow]` tells a stored run, or a work item through its journey with every handoff followed, top to bottom (WP161): what arrived, what the assistant was told, what it thought and did, what checked it, who approved, what was drawn, and — last — the truth and the evaluators' marks. Redacted by substring against every secret held; a value over a workflow record's cap is opened from `<store>/values/` when `workflow run` or `bank run` was given `--keep-values` (WP160). `craftabot campaign … --stories <n>` tells `n` cells per class (how the run ended, and whether an evaluator failed it) under `<out>/stories/<class>/`.

`craftabot keys check [--json] [--config <file>]` says which credentials this process holds, by id and never by value, from what the installed packs declare — `CRAFTABOT_CREDENTIAL_<ID>` for each provider, guard service, evaluator and store — with what each lights and the variables the live smoke scripts read, and notes a smoke key with no harness credential beside it (WP162, `docs/keys.md`). Every recorder refuses to write an artefact that holds any secret the process holds.

`craftabot controls list | export [--format json|markdown] [--out <file>] [--store <dir>] [--experiments <dir>] [--evidence <dir>]` folds the Control Inventory (`110-CONTROL-SUITE-PLAN.md` §4), the table `/workshop/controls` renders. It has one row per control the installed packs ship, among them the components, cards, stacks, readers, evaluators, the declared mechanisms, gate kinds, knobs and ceilings. Each row carries eight facets:

- the catalogue entries that name it;
- where it is fitted: the shipped campaigns and the experiment files under `--experiments` (`experiments` by default);
- whether it fired and its benchmark, from a run store with `--store`;
- its register effect, from the committed reference results under `--evidence` (`docs/evidence` by default) and any in the store (WP150);
- its readings, from `--content` and `--store`;
- where it is turned.

`list` prints one line per kind. `export` writes the table as JSON (`craftabot-control-inventory` v1) or as markdown, one table per kind.

## Experiments (WP89)

`craftabot experiment run --file <experiment.json> [--jobs <n>] [--egress …] [--out ./campaign-out]` expands a design (`docs/schemas/experiment.schema.json`; `72-EXPERIMENTS.md` §3) to one campaign per level combination — the template's guards, builds, brains and contexts with each factor's axis set to its level, the seeds shared — writes each as `<out>/<campaign-id>.campaign.json`, runs each as `campaign` runs one, keeps the report as `<out>/<campaign-id>.report.json`, and folds the reports into `<out>/<experiment-id>.experiment-result.json` (`experiment-result.schema.json`, with its digest) and `.md`: for each metric and factor, every treatment level against the baseline as a difference with its interval and _n_ (Newcombe for rates, Welch for means, the sign test over the pairs the shared seeds make), the cost on each side, and the verdict over the intervals — _supported_, _not-supported_ or _inconclusive_ — with the minimum detectable effect at the achieved _n_ in the note. `experiment analyse --file … --out …` re-folds the reports already there; `experiment render --result <file>` prints a result as markdown, its digest verified.

## Books and sweeps (WP80)

`craftabot book run --workflow <id> --population <seed> --size <n> [--config a,b,…] [--kit <bot>] [--brain …] [--period-days <n>] [--limit <n>] [--jobs <n>] [--egress …] [--markdown <scorecard.md>] [--out ./campaign-out]` runs a book through a workflow's configurations (`64-…` §6.6.3; `73-…` §5): the workflow draws its book from a population at the seed and size (`WorkflowSpec.book`), one build per configuration named — every named one by default — with `--kit`'s bot or the world's default senses and actions, one guard, one brain; the campaign is written as `<out>/<id>.campaign.json` beside the report and run as `campaign` runs one (the pool under `--jobs`, every run kept, the report's human-load rows printed). Its one gate always passes: a book run is a measurement, and the gates a judgment needs come in a campaign file with `source: { kind: "book", workflowId, population | book, configuration?, limit? }` — `craftabot campaign --file` runs one of those exactly as it runs a scenario campaign, `campaigns/fs-lending-book.json` being the one CI runs. `craftabot sweep --file <campaign.json> --knob <name>=<v1>,<v2>,…` is sugar over builds: every build × every value, one build per value named `<build>@<knob>=<value>`, written beside the report and run.

## A day at the bank (WP83)

`craftabot bank run --day <YYYY-MM-DD> --desks <desks.json> [--population <seed>] [--size <n>] [--acceleration <n>|inf] [--brain scripted-optimal|scripted-noisy] [--stop-after <n>] [--egress …] [--out ./runs]` runs one simulated day (`71-THE-CLOCK.md`): the population at the seed and size (2,000 by default), the day's books drawn — the loan book through each desk workflow's own `book`, the alert book, the complaint and advice-request registers — the clock over them at the acceleration (`inf` by default: as fast as it can), and the desks from the file, `[{ id, workflowId, kinds, configuration?, knobs?, concurrency, build?, kit? }]`, each working the kinds it names through its workflow up to its concurrency, routed by kind to the first desk that takes it. Every agent run is written exactly as `run` writes one; every workflow run as `<out>/workflows/<id>/workflow-run.json`; the day as `<out>/bank-runs/<id>/bank-run.json` (`docs/schemas/bank-run.schema.json`) — the clock's options, the desks, the counts by kind and desk, the incidents, every run's id and digest in arrival order, a digest over those, and the wall time outside the digest. Two days from one seed are the same bytes at any concurrency and any acceleration; `campaigns/desks/lending-day.json` is the desks file CI runs, one lending desk at concurrency 4.
