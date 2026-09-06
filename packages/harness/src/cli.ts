import type { EgressMode } from '@craftabot/core';
import { readFile, writeFile } from 'node:fs/promises';
import { defaultConfig, loadConfig, type HarnessConfig } from './config.js';
import { principalFromEnv } from './principal.js';
import { mergeReports } from './commands/merge.js';
import { parseCampaign, type CampaignGuard } from '@craftabot/evals';
import { credentialsFromEnv, type CredentialSource } from './credentials.js';
import { bundleRun } from './commands/bundle.js';
import { evaluateRun, renderEvaluations } from './commands/evaluate.js';
import { runCampaignFile } from './commands/campaign.js';
import { MATRICES, runMatrixCommand } from './commands/matrix.js';
import { bundleGroup } from './commands/bundle.js';
import { importCorpusFile } from './commands/scenarios.js';
import { DEFAULT_CONTENT_DIR, addContent, listContent, renderContent } from './commands/content.js';
import { exportRun } from './commands/export.js';
import { recordCassette } from './commands/record.js';
import { readContentDir } from './storage/file-storage.js';
import { describePacks, renderPacks } from './commands/packs.js';
import { reportIncidents, reportSafetyCase, reportTelemetry } from './commands/report.js';
import { reportAssurance } from './commands/assurance.js';
import { runKit, type BrainTier } from './commands/run.js';
import { forkRun } from './commands/fork.js';
import { createRegistry } from './config.js';
import { createFileStorage } from './storage/file-storage.js';

/**
 * The `craftabot` CLI (WP37). Files in, files out, exit code honest — the
 * shape a pipeline can call. No argument-parsing dependency: the surface is
 * small enough that a hand-written parser is clearer than a library's, and
 * `10-…` §8's "no new production dependency without justification" applies.
 */
export interface CliIo {
	stdout(text: string): void;
	stderr(text: string): void;
	env: NodeJS.ProcessEnv;
}

export interface ParsedArgs {
	command: string | undefined;
	flags: Record<string, string | true>;
	positional: string[];
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
	const [command, ...rest] = argv;
	const flags: Record<string, string | true> = {};
	const positional: string[] = [];
	for (let index = 0; index < rest.length; index++) {
		const arg = rest[index] as string;
		if (!arg.startsWith('--')) {
			positional.push(arg);
			continue;
		}
		const eq = arg.indexOf('=');
		if (eq !== -1) {
			flags[arg.slice(2, eq)] = arg.slice(eq + 1);
			continue;
		}
		const next = rest[index + 1];
		if (next !== undefined && !next.startsWith('--')) {
			flags[arg.slice(2)] = next;
			index += 1;
		} else {
			flags[arg.slice(2)] = true;
		}
	}
	return { command, flags, positional };
}

export const USAGE = `craftabot — the Craft A Bot headless host

Usage:
  craftabot content list [--content ./content]
  craftabot content add --file <record.json> [--content ./content]
      The Workshop content store's file form: authored policy cards,
      assertion cards, scenarios and campaigns as ContentRecord JSON under
      <dir>/<segment>/<slug>.json, read into the local pack by every
      command (--content names the directory; ./content by default).

  craftabot packs [--config craftabot.config.mjs]
      List the packs, brick kinds, providers and goal cards this host can
      assemble, and which CRAFTABOT_CREDENTIAL_<ID> variables it would read.

  craftabot run --kit <bot.craftabot.json> [--card <goalCardId>]
                [--brain scripted-optimal|scripted-noisy|live] [--provider <id>]
                [--egress declared|none]
                [--seed <n>] [--max-ticks <n>] [--deny] [--out ./runs]
                [--counterpart scripted|live] [--counterpart-cartridge <id>] [--max-rounds <n>]
                [--principal <name>] [--stack <guardId> --stack-file <campaign.json>]
      Run a kit file to completion and write the run — run.json, events.jsonl,
      summary.json and a <runId>.craftabot-trace.json the Workshop imports —
      under --out (default ./runs). The scripted brains need no key and are
      reproducible from --seed (default 1); --brain live uses the kit's own
      cartridge, with its provider's key read from CRAFTABOT_CREDENTIAL_<ID>.
      --provider names the provider the cartridge must belong to. --deny
      answers every approval with no (default: yes). --counterpart seats a
      visitor across a desk card (WP55): the kit's bot and a generated
      counterpart run as a two-seat episode, the visitor driven along the
      desk's own script (scripted, no key, reproducible from --seed) or by a
      cartridge (live; --counterpart-cartridge, default the kit's own); the
      episode is written with a <groupRunId>.craftabot-bundle.json. --stack
      names a guard in a campaign file (WP64) and installs its group half on
      the episode: the Watchbot's rules and the breakers on the desk's own
      evaluators — the Compliance Watchbot, on every desk's baseline.

  craftabot assurance [--agent <id>] [--out ./runs] [--file <pack.json>] [--markdown <pack.md>] [--html <pack.html>]
      The assurance pack for one bot (WP67): its inventory entry, safety
      stack, campaigns, evaluations, mitigants, drift and incidents filed
      against every installed control map, sectioned by PRA SS1/23's
      principles — the same fold /workshop/assurance renders. JSON to
      --file or stdout; --markdown and --html write the two renderings, the
      HTML one self-contained file a reader opens with no app. Relevance,
      never compliance.

  craftabot fork --run <runId> [--tick <n>] [--kit <other.craftabot.json>]
                 [--brain scripted-optimal|scripted-noisy] [--seed <n>] [--deny]
                 [--egress declared|none] [--out ./runs]
      A new run that begins where a stored one was after --tick (WP66): the
      world put back, the memory, notebook and usage restored, the scripted
      brain resumed where the origin left it, then run to completion and
      written as run writes a run — with run.started.forkedFrom naming the
      origin, and a verdict on whether the fork diverged from the origin
      and at which tick. --kit forks a counterfactual build onto the same
      goal card; without it the origin's own spec runs again. --tick
      defaults to the origin's last completed tick but one.

  craftabot bundle --run <runId> | --group <groupRunId> [--out ./runs] [--file <path>]
      Write a stored run back out as a .craftabot-trace.json, or a group
      episode as a .craftabot-bundle.json (every member's trace, the merged
      stream, one digest over all of them), redacted and digest-signed, to
      --file or stdout.

  craftabot record --line <lineId> --script <calls.json> [--out ./cassettes] [--egress declared|none]
      Record a service line's live client to a cassette (WP58): every
      {"op", "args"} in the script is called once under an egress guard that
      allows the line's own declared hosts and nothing else, timed, and
      written redacted against every CRAFTABOT_CREDENTIAL_* the process
      holds — a fixture a pack ships under src/cassettes/ and a session
      replays with no network. --egress none refuses every call.

  craftabot export --run <runId> --sink <sinkId> [--sink-config <json>] [--out ./runs]
      Send a stored run to a sink in one go: telemetry/otlp-http (an OTLP
      collector, config {"url": ...}) or telemetry/file (JSONL, config
      {"path": ...}). A run may also stream live: craftabot run ... --sink
      <sinkId> [--sink-config <json>]; a campaign file's "sinks" list does
      the same for every cell.

  craftabot evaluate --run <runId> [--evaluators <id,id>] [--rubric <text>] [--out ./runs]
                     [--project <gcpProject>] [--location europe-west2] [--metric-prompt <template>]
                     [--egress declared|none]
      geap/eval/* run live with CRAFTABOT_CREDENTIAL_GEAP set and --project given, offline otherwise.
      Run evaluators over a stored run and write the records beside it —
      every deterministic evaluator (every assertion card) by default. A
      model evaluator such as evals/judge/rubric asks the run's own provider
      when CRAFTABOT_CREDENTIAL_<ID> is set, and answers inconclusive
      offline otherwise; --rubric is that judge's rubric.

  craftabot scenarios --import <rows.jsonl> --card <goalCardId> --out <pack.json>
                      [--id <packId>] [--name <name>] [--key <manual key>]
                      [--tags <tag,tag>]
      Turn a JSONL corpus ({"text": …, "tags"?: […], "expectedOutcome"?: …}
      per line) into a scenario pack file over one goal card, each row a
      manual entry keyed --key (default "sign") that the adversary plan
      looks up. Name the file to campaign --scenarios to run it.

  craftabot campaign --file <campaign.json> [--out ./campaign-out] [--strict]
                     [--egress declared|none] [--scenarios <pack.json,…>]
                     [--baseline <report.json>] [--junit <path>] [--sarif <path>]
                     [--markdown <path>] [--no-keep-runs] [--config …]
      Run a campaign (scenarios × builds × guards × brains × seeds, with
      gates) and write <reportId>.campaign-report.json under --out, plus the
      renderings named. Every cell's run is kept under --out/runs unless
      --no-keep-runs. --strict exits 1 on any failed gate. --egress none
      refuses every network call (what CI runs); declared, the default,
      allows only the hosts fitted components declare. A live brain needs
      the campaign's own budget and its provider's CRAFTABOT_CREDENTIAL_<ID>.

  craftabot campaign … [--jobs <n>] [--shard <i>/<n>] [--seeds <a>-<b>]
      At scale (WP68): --jobs runs cells in a pool of worker threads (the
      report is placed by cell order, so it reads the same as --jobs 1);
      --shard runs the i-th of n slices and marks the report a shard;
      --seeds replaces the file's seeds with a range.

  craftabot merge --file <campaign.json> [--out ./campaign-out] [--strict] <report.json>…
                  [--baseline <report.json>] [--junit <path>] [--sarif <path>] [--markdown <path>]
      Fold shard reports into one: the cells in campaign order, the gates and
      the summary over the whole. Refuses reports of different campaigns,
      overlapping shards, and a fold whose live cells exceed the budget.

  craftabot campaign --matrix scripted|expert [--out ./campaign-out] [--record] [--strict]
      An ad-hoc matrix with no gates (what "npm run evals" used to be): every
      standard card (or the expert card) × both scripted brain tiers × the
      twenty baseline seeds. Writes <name>.report.json and <name>.scorecard.md
      under --out and diffs against <name>.baseline.json there if one exists;
      --record promotes this run to the baseline (summaries only); --strict
      exits 1 on a regression, which otherwise only the scorecard reports.

  craftabot report --safety-case [--agent <agentId>] | --incidents | --telemetry
                   [--out ./runs] [--file <path>] [--config …]
      The governance artefacts the Workshop's Safety Case, Incidents and
      Telemetry screens render, as JSON, from the runs under --out — produced
      by the same folds over the same stored summaries. --safety-case needs
      --agent unless the store holds exactly one bot.

Every run, fork and campaign cell the harness starts names its principal
(WP65): a service, craftabot-harness, named --principal <name>, else
CRAFTABOT_PRINCIPAL, else this machine's hostname — on run.started, on every
action's attestation, and as the "by" of every approval the harness answers.

Credentials are read only from the environment, as CRAFTABOT_CREDENTIAL_<ID>
(for example CRAFTABOT_CREDENTIAL_OPENAI), and are never written to any file.
`;

const BRAINS: readonly BrainTier[] = ['scripted-optimal', 'scripted-noisy', 'live'];

export async function main(argv: readonly string[], io: CliIo): Promise<number> {
	const args = parseArgs(argv);
	try {
		switch (args.command) {
			case 'content': {
				const verb = args.positional[0];
				const dir = contentDirFrom(args);
				if (verb === 'list' || verb === undefined) {
					io.stdout(renderContent(await listContent(dir)));
					return 0;
				}
				if (verb === 'add') {
					const file = stringFlag(args, 'file');
					if (file === undefined) throw new Error('content add needs --file <record.json>');
					const record = await addContent(dir, file);
					io.stdout(`added ${record.kind} ${record.id} — ${record.title}\n`);
					return 0;
				}
				throw new Error(`content: unknown verb "${verb}" — list or add`);
			}
			case 'packs': {
				const config = await configFrom(args);
				io.stdout(renderPacks(describePacks(config, credentialsFromEnv(io.env))));
				return 0;
			}
			case 'run': {
				const config = await configFrom(args);
				const kitPath = stringFlag(args, 'kit');
				if (kitPath === undefined) throw new Error('run needs --kit <bot.craftabot.json>');
				const providerFlag = stringFlag(args, 'provider');
				const brainFlag = stringFlag(args, 'brain') ?? (providerFlag ? 'live' : 'scripted-optimal');
				if (!BRAINS.includes(brainFlag as BrainTier)) {
					throw new Error(`--brain must be one of ${BRAINS.join(', ')}`);
				}
				const card = stringFlag(args, 'card');
				const maxTicks = numberFlag(args, 'max-ticks');
				const egress = egressFlag(args);
				const sinkId = stringFlag(args, 'sink');
				const sinkConfig = stringFlag(args, 'sink-config');
				const counterpartFlag = stringFlag(args, 'counterpart');
				if (
					counterpartFlag !== undefined &&
					counterpartFlag !== 'scripted' &&
					counterpartFlag !== 'live'
				) {
					throw new Error('--counterpart must be scripted or live');
				}
				const counterpartCartridge = stringFlag(args, 'counterpart-cartridge');
				const maxRounds = numberFlag(args, 'max-rounds');
				// A named stack's chokepoint half on the episode (WP64): `--stack <guardId> --stack-file <campaign.json>`.
				const stackId = stringFlag(args, 'stack');
				const stackFile = stringFlag(args, 'stack-file');
				if ((stackId === undefined) !== (stackFile === undefined)) {
					throw new Error('--stack <guardId> and --stack-file <campaign.json> go together');
				}
				if (stackId !== undefined && counterpartFlag === undefined) {
					throw new Error('--stack installs a group stack on an episode: it needs --counterpart');
				}
				const stack =
					stackId !== undefined && stackFile !== undefined
						? await guardFromCampaignFile(stackFile, stackId)
						: undefined;
				const report = await runKit({
					kitPath,
					brain: brainFlag as BrainTier,
					seed: numberFlag(args, 'seed') ?? 1,
					out: stringFlag(args, 'out') ?? './runs',
					approve: args.flags['deny'] !== true,
					config,
					credentials: credentialsFromEnv(io.env),
					principal: principalFor(io, args),
					...(card !== undefined ? { card } : {}),
					...(providerFlag !== undefined ? { provider: providerFlag } : {}),
					...(maxTicks !== undefined ? { maxTicks } : {}),
					...(egress !== undefined ? { egress } : {}),
					...(sinkId !== undefined
						? { sink: { id: sinkId, ...(sinkConfig !== undefined ? { config: sinkConfig } : {}) } }
						: {}),
					...(counterpartFlag !== undefined
						? {
								counterpart: {
									brain: counterpartFlag,
									...(counterpartCartridge !== undefined
										? { cartridgeId: counterpartCartridge }
										: {})
								}
							}
						: {}),
					...(maxRounds !== undefined ? { maxRounds } : {}),
					...(stack !== undefined ? { stack } : {})
				});
				io.stdout(
					[
						...(report.groupRunId ? [`episode ${report.groupRunId}`] : []),
						`run ${report.runId}`,
						`  bot        ${report.agentId}`,
						`  card       ${report.goalCardId}`,
						`  brain      ${report.providerId}`,
						`  outcome    ${report.outcome} after ${report.ticks} ticks (${report.events} events)`,
						`  directory  ${report.directory}`,
						`  trace      ${report.traceFile}`,
						...(report.counterpartAgentId
							? [
									`  visitor    ${report.counterpartAgentId} (${report.counterpartProviderId})`,
									`  rounds     ${report.rounds}`,
									`  bundle     ${report.bundleFile}`
								]
							: []),
						...(report.sink ? [`  sink       ${report.sink}`] : []),
						''
					].join('\n')
				);
				return report.outcome === 'ERROR' ? 1 : 0;
			}
			case 'fork': {
				// WP66 (`54-FORK-EXPLAIN.md` §4.3): a new run from a stored one's state after --tick.
				const runId = stringFlag(args, 'run');
				if (runId === undefined) throw new Error('fork needs --run <runId>');
				const brainFlag = stringFlag(args, 'brain') ?? 'scripted-optimal';
				if (!BRAINS.includes(brainFlag as BrainTier)) {
					throw new Error(`--brain must be one of ${BRAINS.join(', ')}`);
				}
				const tick = numberFlag(args, 'tick');
				const kitPath = stringFlag(args, 'kit');
				const egress = egressFlag(args);
				const report = await forkRun({
					runId,
					brain: brainFlag as BrainTier,
					seed: numberFlag(args, 'seed') ?? 1,
					out: stringFlag(args, 'out') ?? './runs',
					approve: args.flags['deny'] !== true,
					config: await configFrom(args),
					credentials: credentialsFor(io),
					principal: principalFor(io, args),
					...(tick !== undefined ? { tick } : {}),
					...(kitPath !== undefined ? { kitPath } : {}),
					...(egress !== undefined ? { egress } : {})
				});
				io.stdout(`${JSON.stringify(report, null, '\t')}\n`);
				return 0;
			}
			case 'bundle': {
				const runId = stringFlag(args, 'run');
				const groupId = stringFlag(args, 'group');
				if (runId === undefined && groupId === undefined) {
					throw new Error('bundle needs --run <runId> or --group <groupRunId>');
				}
				const storage = await createFileStorage(stringFlag(args, 'out') ?? './runs');
				const secrets = credentialsFromEnv(io.env).secrets();
				// A group episode (WP48) leaves as a craftabot-bundle; a run as the trace file it always was.
				const trace =
					groupId !== undefined
						? await bundleGroup(storage, groupId, secrets)
						: await bundleRun(storage, runId as string, secrets);
				const text = `${JSON.stringify(trace, null, '\t')}\n`;
				const file = stringFlag(args, 'file');
				if (file !== undefined) {
					await writeFile(file, text, 'utf8');
					io.stdout(`wrote ${file}\n`);
				} else {
					io.stdout(text);
				}
				return 0;
			}
			case 'campaign': {
				const matrix = stringFlag(args, 'matrix');
				if (matrix !== undefined) {
					// The evals CLI's job (WP56 stage B): an ad-hoc matrix, no gates.
					if (!(matrix in MATRICES)) {
						throw new Error(
							`campaign --matrix wants one of ${Object.keys(MATRICES).join(', ')}, got "${matrix}"`
						);
					}
					const total = { done: 0, of: 0 };
					const result = await runMatrixCommand({
						matrix,
						out: stringFlag(args, 'out') ?? './campaign-out',
						record: args.flags['record'] === true,
						strict: args.flags['strict'] === true,
						onCell: (index, count) => {
							total.done = index;
							total.of = count;
						}
					});
					io.stdout(
						[
							`matrix ${result.name} — ${total.of} cells`,
							...result.lines.map((line) => `  ${line}`),
							''
						].join('\n')
					);
					return result.exitCode;
				}
				const file = stringFlag(args, 'file');
				if (file === undefined) {
					throw new Error('campaign needs --file <campaign.json> or --matrix <scripted|expert>');
				}
				const out = stringFlag(args, 'out') ?? './campaign-out';
				const baseline = stringFlag(args, 'baseline');
				const junit = stringFlag(args, 'junit');
				const sarif = stringFlag(args, 'sarif');
				const markdown = stringFlag(args, 'markdown');
				const campaignEgress = egressFlag(args);
				const scenarioPacks = stringFlag(args, 'scenarios')
					?.split(',')
					.filter((s) => s !== '');
				// At scale (WP68, `57-…` §4.2): a worker pool, a slice, a seed range.
				const jobs = numberFlag(args, 'jobs');
				const shard = shardFlag(args);
				const seeds = seedsFlag(args);
				const configPath =
					typeof args.flags['config'] === 'string' ? args.flags['config'] : undefined;
				const { report, reportFile, written } = await runCampaignFile({
					file,
					out,
					keepRuns: args.flags['no-keep-runs'] !== true,
					config: await configFrom(args),
					credentials: credentialsFromEnv(io.env),
					principal: principalFor(io, args),
					...(jobs !== undefined ? { jobs } : {}),
					...(shard !== undefined ? { shard } : {}),
					...(seeds !== undefined ? { seeds } : {}),
					...(configPath !== undefined ? { configPath } : {}),
					contentDir: contentDirFrom(args),
					...(baseline !== undefined ? { baseline } : {}),
					...(junit !== undefined ? { junit } : {}),
					...(sarif !== undefined ? { sarif } : {}),
					...(markdown !== undefined ? { markdown } : {}),
					...(campaignEgress !== undefined ? { egress: campaignEgress } : {}),
					...(scenarioPacks !== undefined ? { scenarioPacks } : {})
				});
				const failed = report.gates.filter((gate) => !gate.passed);
				io.stdout(
					[
						`campaign ${report.campaignId} — ${report.passed ? '✅ PASSED' : '❌ FAILED'}: ${report.gates.length - failed.length} of ${report.gates.length} gates, ${report.cells.length} cells, ${report.budget.liveCells} live${report.shard ? ` (shard ${report.shard.index}/${report.shard.of} — merge the shards before reading the gates)` : ''}`,
						`  report     ${reportFile}`,
						...written.slice(1).map((path) => `  wrote      ${path}`),
						''
					].join('\n')
				);
				for (const gate of failed) {
					io.stderr(
						`  ✗ ${gate.id}: ${gate.observed === undefined ? 'no cells matched' : `observed ${gate.kind === 'metric' ? gate.observed : `${Math.round(gate.observed * 100)}%`}`}, required ${gate.required}\n`
					);
				}
				return args.flags['strict'] === true && !report.passed ? 1 : 0;
			}
			case 'merge': {
				// WP68 (`57-…` §4.2): shard reports folded into one, the gates over the whole.
				const file = stringFlag(args, 'file');
				if (file === undefined) throw new Error('merge needs --file <campaign.json>');
				if (args.positional.length === 0) throw new Error('merge needs the shard reports to fold');
				const junit = stringFlag(args, 'junit');
				const sarif = stringFlag(args, 'sarif');
				const markdown = stringFlag(args, 'markdown');
				const baseline = stringFlag(args, 'baseline');
				const { report, reportFile, written } = await mergeReports({
					file,
					reports: args.positional,
					out: stringFlag(args, 'out') ?? './campaign-out',
					config: await configFrom(args),
					...(junit !== undefined ? { junit } : {}),
					...(sarif !== undefined ? { sarif } : {}),
					...(markdown !== undefined ? { markdown } : {}),
					...(baseline !== undefined ? { baseline } : {})
				});
				const failed = report.gates.filter((gate) => !gate.passed);
				io.stdout(
					[
						`merged ${args.positional.length} reports of ${report.campaignId} — ${report.passed ? '✅ PASSED' : '❌ FAILED'}: ${report.gates.length - failed.length} of ${report.gates.length} gates, ${report.cells.length} cells, ${report.budget.liveCells} live`,
						`  report     ${reportFile}`,
						...written.slice(1).map((path) => `  wrote      ${path}`),
						''
					].join('\n')
				);
				return args.flags['strict'] === true && !report.passed ? 1 : 0;
			}
			case 'scenarios': {
				const file = stringFlag(args, 'import');
				const card = stringFlag(args, 'card');
				const out = stringFlag(args, 'out');
				if (file === undefined || card === undefined || out === undefined) {
					throw new Error(
						'scenarios needs --import <rows.jsonl> --card <goalCardId> --out <pack.json>'
					);
				}
				const id = stringFlag(args, 'id');
				const name = stringFlag(args, 'name');
				const key = stringFlag(args, 'key');
				const tags = stringFlag(args, 'tags')
					?.split(',')
					.filter((t) => t !== '');
				const result = await importCorpusFile({
					file,
					card,
					out,
					config: await configFrom(args),
					...(id !== undefined ? { id } : {}),
					...(name !== undefined ? { name } : {}),
					...(key !== undefined ? { key } : {}),
					...(tags !== undefined ? { tags } : {})
				});
				io.stdout(
					`imported ${result.count} scenarios over ${card} into ${result.file} (tags: ${result.tags.join(', ') || 'none'})\n`
				);
				return 0;
			}
			case 'record': {
				const lineId = stringFlag(args, 'line');
				const scriptPath = stringFlag(args, 'script');
				if (lineId === undefined || scriptPath === undefined) {
					throw new Error('record needs --line <lineId> --script <calls.json>');
				}
				const egress = egressFlag(args);
				const report = await recordCassette({
					lineId,
					scriptPath,
					out: stringFlag(args, 'out') ?? './cassettes',
					config: await configFrom(args),
					credentials: credentialsFromEnv(io.env),
					...(egress !== undefined ? { egress } : {})
				});
				io.stdout(
					[
						`recorded ${report.lineId}`,
						`  entries    ${report.entries} (${report.refused} refused by the egress guard)`,
						`  hosts      ${report.hosts.join(', ') || 'none'}`,
						`  latency    ${report.latencyMs.min}–${report.latencyMs.max} ms`,
						`  browser    ${report.browserCapable === undefined ? 'unknown' : report.browserCapable ? 'CORS open — a browser could call this line' : 'no CORS — the harness is the host'}`,
						`  cassette   ${report.file}`,
						''
					].join('\n')
				);
				return 0;
			}
			case 'export': {
				const runId = stringFlag(args, 'run');
				const sinkId = stringFlag(args, 'sink');
				if (runId === undefined || sinkId === undefined) {
					throw new Error('export needs --run <runId> --sink <sinkId>');
				}
				const sinkConfig = stringFlag(args, 'sink-config');
				const storage = await createFileStorage(stringFlag(args, 'out') ?? './runs');
				const result = await exportRun({
					storage,
					runId,
					sinkId,
					credentials: credentialsFromEnv(io.env),
					...(sinkConfig !== undefined ? { sinkConfig } : {})
				});
				if (!result.ok) {
					io.stderr(`export failed: ${result.error}\n`);
					return 1;
				}
				io.stdout(`exported run ${runId} to ${sinkId}: ${result.sent} spans\n`);
				return 0;
			}
			case 'evaluate': {
				const runId = stringFlag(args, 'run');
				if (runId === undefined) throw new Error('evaluate needs --run <runId>');
				const storage = await createFileStorage(stringFlag(args, 'out') ?? './runs');
				const registry = createRegistry(await configFrom(args));
				const ids = stringFlag(args, 'evaluators');
				const rubric = stringFlag(args, 'rubric');
				// The hosted evaluators' config (WP51): a project is not a secret, so it is a flag, not a credential.
				const project = stringFlag(args, 'project');
				const location = stringFlag(args, 'location') ?? 'europe-west2';
				const metricPrompt = stringFlag(args, 'metric-prompt');
				const configs: Record<string, unknown> = {};
				if (rubric !== undefined) configs['evals/judge/rubric'] = { rubric };
				if (project !== undefined) {
					for (const metric of ['safety', 'fulfillment', 'rubric']) {
						configs[`geap/eval/${metric}`] = {
							projectId: project,
							location,
							...(metricPrompt !== undefined ? { metricPromptTemplate: metricPrompt } : {})
						};
					}
				}
				const evaluateEgress = egressFlag(args);
				const report = await evaluateRun(storage, registry, runId, {
					credentials: credentialsFromEnv(io.env),
					...(ids !== undefined ? { evaluatorIds: ids.split(',').map((id) => id.trim()) } : {}),
					...(Object.keys(configs).length > 0 ? { configs } : {}),
					...(evaluateEgress !== undefined ? { egress: evaluateEgress } : {})
				});
				io.stdout(`evaluated ${runId}
${renderEvaluations(report)}`);
				return report.unknown.length > 0 ? 1 : 0;
			}
			case 'assurance': {
				// WP67 (`53-ASSURANCE-PACK.md` §4.3): the pack for one bot, and its two renderings.
				const storage = await createFileStorage(stringFlag(args, 'out') ?? './runs');
				const registry = createRegistry(await configFrom(args));
				const { pack, markdown, html } = await reportAssurance(
					storage,
					registry,
					stringFlag(args, 'agent')
				);
				const json = `${JSON.stringify(pack, null, '\t')}\n`;
				const file = stringFlag(args, 'file');
				const markdownPath = stringFlag(args, 'markdown');
				const htmlPath = stringFlag(args, 'html');
				if (markdownPath !== undefined) {
					await writeFile(markdownPath, markdown, 'utf8');
					io.stdout(`wrote ${markdownPath}\n`);
				}
				if (htmlPath !== undefined) {
					await writeFile(htmlPath, html, 'utf8');
					io.stdout(`wrote ${htmlPath}\n`);
				}
				if (file !== undefined) {
					await writeFile(file, json, 'utf8');
					io.stdout(`wrote ${file}\n`);
				} else if (markdownPath === undefined && htmlPath === undefined) {
					io.stdout(json);
				}
				return 0;
			}
			case 'report': {
				const storage = await createFileStorage(stringFlag(args, 'out') ?? './runs');
				let report: unknown;
				if (args.flags['safety-case'] !== undefined) {
					const registry = createRegistry(await configFrom(args));
					report = await reportSafetyCase(storage, registry, stringFlag(args, 'agent'));
				} else if (args.flags['incidents'] !== undefined) {
					report = await reportIncidents(storage);
				} else if (args.flags['telemetry'] !== undefined) {
					report = await reportTelemetry(storage);
				} else {
					throw new Error('report needs one of --safety-case, --incidents or --telemetry');
				}
				const text = `${JSON.stringify(report, null, '\t')}\n`;
				const file = stringFlag(args, 'file');
				if (file !== undefined) {
					await writeFile(file, text, 'utf8');
					io.stdout(`wrote ${file}\n`);
				} else {
					io.stdout(text);
				}
				return 0;
			}
			case undefined:
			case 'help':
			case '--help':
				io.stdout(USAGE);
				return args.command === undefined ? 1 : 0;
			default:
				io.stderr(`craftabot: unknown command '${args.command}'\n\n${USAGE}`);
				return 1;
		}
	} catch (error) {
		io.stderr(`craftabot: ${error instanceof Error ? error.message : String(error)}\n`);
		return 1;
	}
}

async function configFrom(args: ParsedArgs): Promise<HarnessConfig> {
	const path = args.flags['config'];
	const config = typeof path === 'string' ? await loadConfig(path) : defaultConfig();
	// Authored content (WP46): `--content <dir>`, `./content` by default, into the `local` pack.
	const content = await readContentDir(contentDirFrom(args));
	return content.length > 0 ? { ...config, content } : config;
}

function contentDirFrom(args: ParsedArgs): string {
	return stringFlag(args, 'content') ?? DEFAULT_CONTENT_DIR;
}

/** `--egress declared|none` (WP41) — anything else is refused, since a typo here would silently widen what a run may call. */
/** `--shard i/n` (WP68): the i-th of n slices, 1-based. */
function shardFlag(args: ParsedArgs): { index: number; of: number } | undefined {
	const raw = stringFlag(args, 'shard');
	if (raw === undefined) return undefined;
	const match = /^(\d+)\/(\d+)$/.exec(raw);
	if (!match) throw new Error(`--shard wants i/n, got "${raw}"`);
	return { index: Number(match[1]), of: Number(match[2]) };
}

/** `--seeds a-b` (WP68): the file's seeds replaced by the range. */
function seedsFlag(args: ParsedArgs): { from: number; to: number } | undefined {
	const raw = stringFlag(args, 'seeds');
	if (raw === undefined) return undefined;
	const match = /^(\d+)-(\d+)$/.exec(raw);
	if (!match) throw new Error(`--seeds wants a-b, got "${raw}"`);
	return { from: Number(match[1]), to: Number(match[2]) };
}

function egressFlag(args: ParsedArgs): EgressMode | undefined {
	const value = stringFlag(args, 'egress');
	if (value === undefined) return undefined;
	if (value !== 'declared' && value !== 'none') {
		throw new Error(`--egress must be "declared" or "none", not "${value}"`);
	}
	return value;
}

function stringFlag(args: ParsedArgs, name: string): string | undefined {
	const value = args.flags[name];
	return typeof value === 'string' ? value : undefined;
}

function numberFlag(args: ParsedArgs, name: string): number | undefined {
	const value = stringFlag(args, name);
	if (value === undefined) return undefined;
	const parsed = Number(value);
	if (!Number.isInteger(parsed)) throw new Error(`--${name} must be a whole number`);
	return parsed;
}

/** Exposed so a test can hand the CLI a planted environment without touching `process.env`. */
export /** A guard by id out of a campaign file (WP64, `--stack`): its `group` half is what an episode installs. */
async function guardFromCampaignFile(file: string, guardId: string): Promise<CampaignGuard> {
	const campaign = parseCampaign(JSON.parse(await readFile(file, 'utf8')));
	const guard = campaign.guards.find((entry) => entry.id === guardId);
	if (!guard) {
		throw new Error(
			`campaign '${campaign.id}' has no guard '${guardId}' (it has ${campaign.guards.map((entry) => entry.id).join(', ')})`
		);
	}
	if (!guard.group) {
		throw new Error(`guard '${guardId}' has no group half — nothing to install on an episode`);
	}
	return guard;
}

/** The harness's principal for this invocation (WP65): `--principal <name>`, else the environment, else the hostname. */
function principalFor(io: CliIo, args: ParsedArgs) {
	const name = stringFlag(args, 'principal');
	return principalFromEnv(io.env, name !== undefined ? { name } : {});
}

function credentialsFor(io: CliIo): CredentialSource {
	return credentialsFromEnv(io.env);
}
