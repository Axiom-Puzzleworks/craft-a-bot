import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	SPARK_MODES,
	sparkModeById,
	sparkPatternById,
	type SparkPattern
} from '@craftabot/pack-dgx-spark';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main } from '../cli.js';
import {
	observeSparks,
	readLease,
	resolvePattern,
	sparkDown,
	sparkPreflight,
	sparkUp,
	sparkVerify,
	type ShellResult,
	type SparkDeps
} from './spark.js';

/**
 * **`craftabot spark`** (`99-DGX-SPARK.md` §9), against two fake Sparks: a
 * fake `fetch` answers each unit's `/v1/models` from the mode it is in, and a
 * fake ssh answers the mode query and runs `switch.sh`, changing the mode. No
 * network, no ssh, no clock.
 */
type UnitName = 'spark-619c' | 'spark-ef08';
const ALIAS: Record<string, UnitName> = { spark1: 'spark-619c', spark2: 'spark-ef08' };

class FakeSparks {
	modes: Record<UnitName, string> = { 'spark-619c': 'puzzle', 'spark-ef08': 'puzzle' };
	down = new Set<UnitName>();
	sshDown = new Set<UnitName>();
	failSwitch = new Set<string>();
	commands: Array<{ alias: string; command: string }> = [];

	private modelsOf(unit: UnitName) {
		const mode = sparkModeById(this.modes[unit]);
		if (!mode?.model) return [];
		return mode.served.map((id) => ({
			id,
			root: `/models/${mode.model}`,
			max_model_len: mode.contextTokens
		}));
	}

	fetch = (async (input: string | URL | Request) => {
		const url = String(input);
		const unit =
			url.includes('spark-619c') || url.includes('100.119.19.90') ? 'spark-619c' : 'spark-ef08';
		if (this.down.has(unit)) throw new TypeError('fetch failed');
		return Response.json({ data: this.modelsOf(unit) });
	}) as typeof globalThis.fetch;

	shell = {
		run: async (alias: string, command: string): Promise<ShellResult> => {
			this.commands.push({ alias, command });
			const unit = ALIAS[alias]!;
			if (this.sshDown.has(unit)) return { code: 255, stdout: '', stderr: 'ssh: timed out' };
			if (command.includes('docker ps')) {
				const mode = this.modes[unit];
				return mode === 'off'
					? { code: 1, stdout: '', stderr: '' }
					: { code: 0, stdout: `mode-${mode}\n`, stderr: '' };
			}
			const match = /switch\.sh (\S+)$/.exec(command);
			if (!match) return { code: 2, stdout: '', stderr: 'unexpected' };
			const target = match[1]!;
			if (this.failSwitch.has(`${unit}:${target}`))
				return { code: 0, stdout: `== mode '${target}' FAILED (restart loop)`, stderr: '' };
			this.modes[unit] = target;
			return {
				code: 0,
				stdout:
					target === 'off' ? '== all mode stacks stopped' : `== mode '${target}' READY at 12:00`,
				stderr: ''
			};
		}
	};
}

let dir: string;
let sparks: FakeSparks;
let log: string[];
let deps: SparkDeps;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'spark-'));
	sparks = new FakeSparks();
	log = [];
	deps = {
		shell: sparks.shell,
		fetch: sparks.fetch,
		leaseFile: join(dir, 'lease.json'),
		now: () => new Date('2026-10-04T12:00:00.000Z'),
		sleep: async () => undefined,
		log: (line) => log.push(line)
	};
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

const pattern = (id: string): SparkPattern => sparkPatternById(id)!;
const switches = () =>
	sparks.commands
		.filter((c) => c.command.includes('switch.sh'))
		.map((c) => `${c.alias}: ${c.command}`);

describe('observing the units', () => {
	it('learns the mode from the compose project over ssh, and off when none is running', async () => {
		sparks.modes['spark-ef08'] = 'off';
		const units = await observeSparks(deps);
		expect(units.map((u) => [u.unit, u.mode, u.modeFrom])).toEqual([
			['spark-619c', 'puzzle', 'ssh'],
			['spark-ef08', 'off', 'ssh']
		]);
	});

	it('falls back to inferring the mode from the names it serves when ssh does not answer, and says so', async () => {
		sparks.sshDown.add('spark-619c');
		const units = await observeSparks(deps);
		expect(units[0]).toMatchObject({ mode: 'puzzle', modeFrom: 'inferred', reachable: true });
	});

	it('reports a unit nobody can reach', async () => {
		sparks.down.add('spark-ef08');
		sparks.sshDown.add('spark-ef08');
		const units = await observeSparks(deps);
		expect(units[1]).toMatchObject({ reachable: false, mode: 'unknown' });
	});
});

describe('standing a pattern up', () => {
	it('changes only the unit that must change, writes the lease first, and verifies the roles', async () => {
		const result = await sparkUp(deps, pattern('brain-and-seats'));
		expect(result.ok).toBe(true);
		expect(result.changed).toBe(true);
		expect(switches()).toEqual(['spark2: bash ~/stacks/modes/switch.sh chat']);
		expect(sparks.modes).toEqual({ 'spark-619c': 'puzzle', 'spark-ef08': 'chat' });
		expect(await readLease(deps.leaseFile)).toEqual({
			pattern: 'brain-and-seats',
			startedAt: '2026-10-04T12:00:00.000Z',
			previous: { 'spark-619c': 'puzzle', 'spark-ef08': 'puzzle' }
		});
		expect(result.roles.every((r) => r.ready)).toBe(true);
	});

	it('does nothing, and writes no lease, when the pattern is already up', async () => {
		const result = await sparkUp(deps, pattern('reasoning-pair'));
		expect(result).toMatchObject({ ok: true, changed: false });
		expect(switches()).toEqual([]);
		expect(await readLease(deps.leaseFile)).toBeUndefined();
	});

	it('a second pattern replaces the first and the lease still remembers how the Sparks were found', async () => {
		await sparkUp(deps, pattern('brain-and-seats'));
		await sparkUp(deps, pattern('fast-pair'));
		expect(sparks.modes).toEqual({ 'spark-619c': 'chat', 'spark-ef08': 'chat' });
		const lease = await readLease(deps.leaseFile);
		expect(lease?.pattern).toBe('fast-pair');
		expect(lease?.previous).toEqual({ 'spark-619c': 'puzzle', 'spark-ef08': 'puzzle' });
		await sparkDown(deps);
		expect(sparks.modes).toEqual({ 'spark-619c': 'puzzle', 'spark-ef08': 'puzzle' });
	});

	it('reports a switch that failed, keeps the lease so down can undo it, and says which unit', async () => {
		sparks.failSwitch.add('spark-ef08:chat');
		const result = await sparkUp(deps, pattern('brain-and-seats'), { settleMs: 0 });
		expect(result.ok).toBe(false);
		expect(result.failed).toEqual(['spark-ef08']);
		expect(await readLease(deps.leaseFile)).toBeDefined();
	});

	it('refuses an unreachable unit and a shared mode, before any command runs', async () => {
		sparks.down.add('spark-ef08');
		await expect(sparkUp(deps, pattern('brain-and-seats'))).rejects.toThrow(
			/spark-ef08 is unreachable/
		);
		sparks.down.clear();
		const shared: SparkPattern = {
			id: 'shared-x',
			title: 'x',
			purpose: 'x',
			units: { 'spark-619c': 'shared-head', 'spark-ef08': 'shared-worker' },
			roles: {}
		};
		await expect(sparkUp(deps, shared)).rejects.toThrow(/spark-mode.sh shared/);
		expect(switches()).toEqual([]);
	});

	it('never puts a mode name that is not in the catalogue into a command line', async () => {
		const forged = {
			id: 'forged',
			title: 'x',
			purpose: 'x',
			units: { 'spark-ef08': 'puzzle; rm -rf ~' },
			roles: {}
		} as unknown as SparkPattern;
		await expect(sparkUp(deps, forged)).rejects.toThrow(/not a mode the catalogue knows/);
		expect(switches()).toEqual([]);
		await expect(resolvePattern(undefined, join(dir, 'missing.json'))).rejects.toThrow();
	});

	it('stands both units down with the idle pattern, and down restores them', async () => {
		await sparkUp(deps, pattern('idle'));
		expect(sparks.modes).toEqual({ 'spark-619c': 'off', 'spark-ef08': 'off' });
		const result = await sparkDown(deps);
		expect(result.restored.map((r) => [r.unit, r.to, r.ok])).toEqual([
			['spark-619c', 'puzzle', true],
			['spark-ef08', 'puzzle', true]
		]);
		expect(sparks.modes).toEqual({ 'spark-619c': 'puzzle', 'spark-ef08': 'puzzle' });
		await expect(stat(deps.leaseFile)).rejects.toThrow();
	});
});

describe('shutting down', () => {
	it('puts back only what changed, and leaves a unit whose earlier mode was never learned', async () => {
		await sparkUp(deps, pattern('fast-pair'));
		const lease = await readLease(deps.leaseFile);
		expect(lease?.previous['spark-ef08']).toBe('puzzle');
		const forged = { ...lease!, previous: { 'spark-619c': 'puzzle', 'spark-ef08': 'unknown' } };
		const { writeFile } = await import('node:fs/promises');
		await writeFile(deps.leaseFile, JSON.stringify(forged), 'utf8');
		const result = await sparkDown(deps);
		expect(result.restored.map((r) => r.unit)).toEqual(['spark-619c']);
		expect(result.skipped).toEqual([
			{ unit: 'spark-ef08', why: expect.stringContaining('left as it is') }
		]);
		expect(sparks.modes['spark-ef08']).toBe('chat');
	});

	it('keeps the lease when a unit was out of reach, so down can be run again', async () => {
		await sparkUp(deps, pattern('fast-pair'));
		sparks.down.add('spark-ef08');
		sparks.sshDown.add('spark-ef08');
		const result = await sparkDown(deps);
		expect(result.skipped).toEqual([{ unit: 'spark-ef08', why: 'unreachable' }]);
		expect(await readLease(deps.leaseFile)).toBeDefined();
		sparks.down.clear();
		sparks.sshDown.clear();
		await sparkDown(deps);
		expect(await readLease(deps.leaseFile)).toBeUndefined();
		expect(sparks.modes).toEqual({ 'spark-619c': 'puzzle', 'spark-ef08': 'puzzle' });
	});

	it('has nothing to put back without a lease, but --off stops both units', async () => {
		await expect(sparkDown(deps)).rejects.toThrow(/no lease/);
		const result = await sparkDown(deps, { off: true });
		expect(result.restored.map((r) => [r.unit, r.to])).toEqual([
			['spark-619c', 'off'],
			['spark-ef08', 'off']
		]);
		expect(sparks.modes).toEqual({ 'spark-619c': 'off', 'spark-ef08': 'off' });
	});
});

describe('verifying, and the preflight before a recording', () => {
	it('is read-only: it runs the mode query and nothing else', async () => {
		await sparkVerify(deps, { pattern: pattern('brain-and-seats') });
		expect(switches()).toEqual([]);
	});

	it('names the cartridges a design asks of the Sparks and the patterns that would serve them', async () => {
		const design = {
			template: { brains: [{ id: 'live', tier: 'live', cartridgeId: 'dgx-spark/quick-qwen' }] }
		};
		const verified = await sparkVerify(deps, { document: design });
		expect(verified.ok).toBe(false);
		expect(verified.suggest.map((p) => p.id)).toEqual(['brain-and-seats', 'fast-pair']);
		const refusal = await sparkPreflight(deps, design);
		expect(refusal).toContain('dgx-spark/quick-qwen');
		expect(refusal).toContain('craftabot spark up --pattern brain-and-seats');
		// Served, it is silent; a design with no Spark cartridge is none of its business.
		sparks.modes['spark-ef08'] = 'chat';
		expect(await sparkPreflight(deps, design)).toBeUndefined();
		expect(await sparkPreflight(deps, { brains: [{ cartridgeId: 'openai/x' }] })).toBeUndefined();
	});

	it('mirrors the Sparks catalogue: every mode a shipped pattern sets is one the catalogue has', () => {
		for (const p of ['reasoning-pair', 'brain-and-seats', 'fast-pair', 'reader-batch', 'idle'])
			for (const mode of Object.values(pattern(p).units))
				expect(mode === 'off' || SPARK_MODES.some((m) => m.id === mode)).toBe(true);
	});
});

describe('the command line, offline parts', () => {
	const run = async (...argv: string[]) => {
		let out = '';
		const code = await main(argv, {
			stdout: (t) => (out += t),
			stderr: (t) => (out += t),
			env: {}
		});
		return { code, out };
	};

	it('lists the shipped patterns with their roles, and the ones that serve a cartridge', async () => {
		const all = await run('spark', 'patterns');
		expect(all.code).toBe(0);
		for (const id of ['reasoning-pair', 'brain-and-seats', 'fast-pair', 'reader-batch', 'idle'])
			expect(all.out).toContain(id);
		expect(all.out).not.toContain('PROBLEMS');
		const some = await run('spark', 'patterns', '--serves', 'dgx-spark/quick-qwen', '--json');
		expect(JSON.parse(some.out).map((p: { id: string }) => p.id)).toEqual([
			'brain-and-seats',
			'fast-pair'
		]);
	});

	it('refuses an unknown subcommand and a pattern file that fails its check', async () => {
		const bad = await run('spark', 'frobnicate');
		expect(bad.code).not.toBe(0);
		const { writeFile } = await import('node:fs/promises');
		const file = join(dir, 'p.json');
		await writeFile(
			file,
			JSON.stringify({
				id: 'p',
				title: 'p',
				purpose: 'p',
				units: { 'spark-619c': 'nope' },
				roles: {}
			}),
			'utf8'
		);
		const refused = await run('spark', 'plan', '--pattern-file', file);
		expect(refused.code).not.toBe(0);
		expect(refused.out).toContain('catalogue knows');
		const lease = await readFile(join(dir, 'nothing'), 'utf8').catch(() => undefined);
		expect(lease).toBeUndefined();
	});
});

describe('record --concurrency (99-DGX-SPARK.md §9)', () => {
	const run = async (...argv: string[]) => {
		let out = '';
		const code = await main(argv, {
			stdout: (t) => (out += t),
			stderr: (t) => (out += t),
			env: {}
		});
		return { code, out };
	};

	it('is for a local provider only, and takes a number or auto', async () => {
		const { writeFile } = await import('node:fs/promises');
		const file = join(dir, 'design.json');
		await writeFile(file, '{}', 'utf8');
		for (const value of ['4', 'auto']) {
			const hosted = await run(
				'record',
				'--experiment',
				file,
				'--provider',
				'openai',
				'--concurrency',
				value
			);
			expect(hosted.code).not.toBe(0);
			expect(hosted.out).toContain('local provider');
		}
		const nonsense = await run(
			'record',
			'--experiment',
			file,
			'--provider',
			'dgx-spark',
			'--concurrency',
			'lots'
		);
		expect(nonsense.out).toContain('whole number');
	});
});
