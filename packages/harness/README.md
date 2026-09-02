# `@craftabot/harness`

The headless host (`docs/design-day2/26-TARGET-DESIGN-V3.md` §6.8, WP37): run a bot, keep the evidence, report on it — from a Node process and the `craftabot` CLI, against the same contracts the browser uses. The browser is _a_ host, not _the_ host.

```bash
npm run build                                  # the CLI runs from dist
npm run craftabot -- packs
npm run craftabot -- run --kit packages/harness/fixtures/snackbot.craftabot.json --card starter/snack --seed 7 --out ./runs
npm run craftabot -- report --safety-case --out ./runs
npm run craftabot -- report --incidents --out ./runs
npm run craftabot -- bundle --run <runId> --out ./runs --file trace.craftabot-trace.json
npm run craftabot -- campaign --file campaigns/injection-baseline.json --strict --out ./campaign-out \
    --junit ./campaign-out/junit.xml --sarif ./campaign-out/results.sarif --markdown ./campaign-out/scorecard.md
```

## Campaigns

A campaign (`docs/design-day2/28-CAMPAIGNS.md`) is scenarios × builds × guards × brains × seeds with gates — a guardrail regression suite as a file. `craftabot campaign` runs one and writes `<reportId>.campaign-report.json` plus the renderings you name (markdown for a person, JUnit for CI, SARIF for code scanning), and keeps every cell's run under `--out/runs` so a failed gate's run ids open with `bundle`. `--strict` exits 1 on any failed gate; that is what CI runs on `campaigns/injection-baseline.json`. A live brain needs the campaign's own `budget` and its provider's credential.

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

Read only from `CRAFTABOT_CREDENTIAL_<ID>` — `<ID>` the provider or brick credential id, upper-cased, non-alphanumerics folded to `_` (`CRAFTABOT_CREDENTIAL_OPENAI`, `CRAFTABOT_CREDENTIAL_GEAP`). Never from a file the harness wrote, never printed, and every file it writes is redacted against every secret it holds. `key-leak.test.ts` plants one secret per declared credential and sweeps.

## Packs

The default pack list is every workspace pack bar the Kit's own demo pack. To use a different list, `--config craftabot.config.mjs` — a plain ES module whose default export is `{ packs: PackManifest[] }`. Nothing is discovered.

## Not allowed to depend on

Svelte, SvelteKit, `apps/workbench` — the harness is a host beside the workbench, never over it.
