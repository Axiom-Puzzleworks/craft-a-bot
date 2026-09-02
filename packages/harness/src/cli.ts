import { writeFile } from 'node:fs/promises';
import { defaultConfig, loadConfig, type HarnessConfig } from './config.js';
import { credentialsFromEnv, type CredentialSource } from './credentials.js';
import { bundleRun } from './commands/bundle.js';
import { describePacks, renderPacks } from './commands/packs.js';
import { reportIncidents, reportSafetyCase, reportTelemetry } from './commands/report.js';
import { runKit, type BrainTier } from './commands/run.js';
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
  craftabot packs [--config craftabot.config.mjs]
      List the packs, brick kinds, providers and goal cards this host can
      assemble, and which CRAFTABOT_CREDENTIAL_<ID> variables it would read.

  craftabot run --kit <bot.craftabot.json> [--card <goalCardId>]
                [--brain scripted-optimal|scripted-noisy|live] [--provider <id>]
                [--seed <n>] [--max-ticks <n>] [--deny] [--out ./runs]
      Run a kit file to completion and write the run — run.json, events.jsonl,
      summary.json and a <runId>.craftabot-trace.json the Workshop imports —
      under --out (default ./runs). The scripted brains need no key and are
      reproducible from --seed (default 1); --brain live uses the kit's own
      cartridge, with its provider's key read from CRAFTABOT_CREDENTIAL_<ID>.
      --provider names the provider the cartridge must belong to. --deny
      answers every approval with no (default: yes).

  craftabot bundle --run <runId> [--out ./runs] [--file <path>]
      Write a stored run back out as a .craftabot-trace.json (to --file, or
      stdout), redacted and digest-signed.

  craftabot report --safety-case [--agent <agentId>] | --incidents | --telemetry
                   [--out ./runs] [--file <path>] [--config …]
      The governance artefacts the Workshop's Safety Case, Incidents and
      Telemetry screens render, as JSON, from the runs under --out — produced
      by the same folds over the same stored summaries. --safety-case needs
      --agent unless the store holds exactly one bot.

Credentials are read only from the environment, as CRAFTABOT_CREDENTIAL_<ID>
(for example CRAFTABOT_CREDENTIAL_OPENAI), and are never written to any file.
`;

const BRAINS: readonly BrainTier[] = ['scripted-optimal', 'scripted-noisy', 'live'];

export async function main(argv: readonly string[], io: CliIo): Promise<number> {
	const args = parseArgs(argv);
	try {
		switch (args.command) {
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
				const report = await runKit({
					kitPath,
					brain: brainFlag as BrainTier,
					seed: numberFlag(args, 'seed') ?? 1,
					out: stringFlag(args, 'out') ?? './runs',
					approve: args.flags['deny'] !== true,
					config,
					credentials: credentialsFromEnv(io.env),
					...(card !== undefined ? { card } : {}),
					...(providerFlag !== undefined ? { provider: providerFlag } : {}),
					...(maxTicks !== undefined ? { maxTicks } : {})
				});
				io.stdout(
					[
						`run ${report.runId}`,
						`  bot        ${report.agentId}`,
						`  card       ${report.goalCardId}`,
						`  brain      ${report.providerId}`,
						`  outcome    ${report.outcome} after ${report.ticks} ticks (${report.events} events)`,
						`  directory  ${report.directory}`,
						`  trace      ${report.traceFile}`,
						''
					].join('\n')
				);
				return report.outcome === 'ERROR' ? 1 : 0;
			}
			case 'bundle': {
				const runId = stringFlag(args, 'run');
				if (runId === undefined) throw new Error('bundle needs --run <runId>');
				const storage = await createFileStorage(stringFlag(args, 'out') ?? './runs');
				const trace = await bundleRun(storage, runId, credentialsFromEnv(io.env).secrets());
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
	return typeof path === 'string' ? loadConfig(path) : defaultConfig();
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
export function credentialsFor(io: CliIo): CredentialSource {
	return credentialsFromEnv(io.env);
}
