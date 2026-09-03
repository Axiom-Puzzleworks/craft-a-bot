import { describe, expect, it } from 'vitest';
import { main, parseArgs, type CliIo } from './cli.js';

function io(env: NodeJS.ProcessEnv = {}): CliIo & { out: string; err: string } {
	const sink = {
		out: '',
		err: '',
		env,
		stdout(text: string) {
			sink.out += text;
		},
		stderr(text: string) {
			sink.err += text;
		}
	};
	return sink;
}

/** WP41: `--egress` takes exactly two values; a typo must not widen what a run may call. */
describe('--egress', () => {
	it('refuses anything but declared or none', async () => {
		const sink = io();
		expect(await main(['run', '--kit', 'x.json', '--egress', 'everything'], sink)).toBe(1);
		expect(sink.err).toContain('--egress must be "declared" or "none"');
	});
});

describe('parseArgs', () => {
	it('reads a command, --flag value, --flag=value, bare --flag and positionals', () => {
		expect(parseArgs(['run', '--kit', 'bot.json', '--seed=7', 'extra', '--strict'])).toEqual({
			command: 'run',
			flags: { kit: 'bot.json', seed: '7', strict: true },
			positional: ['extra']
		});
		// A bare flag followed by a word takes it as its value — say `--flag=value`
		// or put the flag last when that is not what you mean.
		expect(parseArgs(['run', '--strict', 'extra']).flags).toEqual({ strict: 'extra' });
		expect(parseArgs([])).toEqual({ command: undefined, flags: {}, positional: [] });
	});
});

describe('craftabot', () => {
	it('prints usage and fails when given nothing to do', async () => {
		const sink = io();
		expect(await main([], sink)).toBe(1);
		expect(sink.out).toContain('Usage');
	});

	it('prints usage and succeeds for help', async () => {
		const sink = io();
		expect(await main(['help'], sink)).toBe(0);
		expect(sink.out).toContain('craftabot packs');
	});

	it('refuses an unknown command on stderr', async () => {
		const sink = io();
		expect(await main(['dance'], sink)).toBe(1);
		expect(sink.err).toContain("unknown command 'dance'");
	});

	it('lists packs without printing a planted secret', async () => {
		const sink = io({ CRAFTABOT_CREDENTIAL_OPENAI: 'sk-planted-secret' });
		expect(await main(['packs'], sink)).toBe(0);
		expect(sink.out).toContain('starter');
		expect(sink.out).toContain('CRAFTABOT_CREDENTIAL_OPENAI');
		expect(sink.out).not.toContain('sk-planted-secret');
	});

	it('reports a config file it cannot load, honestly', async () => {
		const sink = io();
		expect(await main(['packs', '--config', './does-not-exist.mjs'], sink)).toBe(1);
		expect(sink.err).toMatch(/craftabot:/);
	});
});
