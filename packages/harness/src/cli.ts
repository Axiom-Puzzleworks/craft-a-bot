import { defaultConfig, loadConfig, type HarnessConfig } from './config.js';
import { credentialsFromEnv, type CredentialSource } from './credentials.js';
import { describePacks, renderPacks } from './commands/packs.js';

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

Credentials are read only from the environment, as CRAFTABOT_CREDENTIAL_<ID>
(for example CRAFTABOT_CREDENTIAL_OPENAI), and are never written to any file.
`;

export async function main(argv: readonly string[], io: CliIo): Promise<number> {
	const args = parseArgs(argv);
	try {
		switch (args.command) {
			case 'packs': {
				const config = await configFrom(args);
				io.stdout(renderPacks(describePacks(config, credentialsFromEnv(io.env))));
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

/** Exposed so a test can hand the CLI a planted environment without touching `process.env`. */
export function credentialsFor(io: CliIo): CredentialSource {
	return credentialsFromEnv(io.env);
}
