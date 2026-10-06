import { describe, expect, it } from 'vitest';
import { surveySparks } from './fleet.js';
import {
	SPARK_PATTERNS,
	checkSparkPattern,
	inferMode,
	patternsServing,
	planSparkPattern,
	rolesReady,
	sparkCartridgesIn,
	sparkPatternById,
	type SparkPattern,
	type SparkUnitState
} from './patterns.js';
import { SPARK_MODES, modesServing, sparkModeById } from './modes.js';
import { createSparkTransport, sparkLoad } from './transport.js';

/**
 * **Spark patterns** (`99-DGX-SPARK.md` §9), offline: the catalogue and the
 * shipped patterns hold together; a pattern is checked against the catalogue,
 * planned against a survey and its roles verified against it; the transport
 * spreads a batch across the units that serve a model and releases its count
 * when a body has been read.
 */
const GIANT_MODEL = {
	id: 'puzzle-llm',
	root: '/models/Qwen3.5-122B-A10B-NVFP4',
	maxModelLen: 40960
};
const QUICK_MODEL = { id: 'qwen3.6', root: '/models/Qwen3.6-35B-A3B-NVFP4', maxModelLen: 262144 };
const CPF_MODEL = {
	id: 'qwen3.5-122b',
	root: '/models/Qwen3.5-122B-A10B-NVFP4',
	maxModelLen: 4096
};

const state = (
	unit: SparkUnitState['unit'],
	mode: string,
	models: SparkUnitState['models'],
	reachable = true
): SparkUnitState => ({ unit, reachable, models, mode, modeFrom: 'ssh' });

describe('the mode catalogue', () => {
	it('has unique ids that are safe folder names, and a model for every language mode', () => {
		const ids = SPARK_MODES.map((mode) => mode.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const mode of SPARK_MODES) {
			expect(mode.id).toMatch(/^[a-z][a-z0-9-]*$/);
			if (mode.kind === 'llm') {
				expect(mode.model).toBeTruthy();
				expect(mode.served.length).toBeGreaterThan(0);
			}
		}
	});

	it('finds the modes that serve a model directory or a served name', () => {
		expect(modesServing('Qwen3.5-122B-A10B-NVFP4').map((m) => m.id)).toEqual(
			expect.arrayContaining(['puzzle', 'lang-single', 'cpf-large'])
		);
		expect(modesServing('qwen3.6').map((m) => m.id)).toEqual(['chat']);
		expect(sparkModeById('cpf-large')?.logprobs).toBe(true);
	});
});

describe('the shipped patterns', () => {
	it.each(SPARK_PATTERNS.map((p) => [p.id, p] as const))(
		'%s passes its own check',
		(_id, pattern) => {
			expect(checkSparkPattern(pattern)).toEqual([]);
		}
	);

	it('has unique ids and the five roles somewhere', () => {
		expect(new Set(SPARK_PATTERNS.map((p) => p.id)).size).toBe(SPARK_PATTERNS.length);
		const roles = new Set(SPARK_PATTERNS.flatMap((p) => Object.keys(p.roles)));
		expect([...roles].sort()).toEqual(['brain', 'labeller', 'reader', 'redteam', 'seat']);
		expect(sparkPatternById('idle')?.units).toEqual({ 'spark-619c': 'off', 'spark-ef08': 'off' });
	});
});

describe('checkSparkPattern', () => {
	const base: SparkPattern = {
		id: 'x',
		title: 'x',
		purpose: 'x',
		units: { 'spark-619c': 'puzzle' },
		roles: { brain: { cartridge: 'dgx-spark/giant-qwen' } }
	};
	const problems = (over: Partial<SparkPattern>) => checkSparkPattern({ ...base, ...over });

	it('says what is wrong, naming the pattern', () => {
		expect(problems({ units: {} })).toContain('pattern "x": it names no unit');
		expect(problems({ units: { 'spark-nope': 'puzzle' } as never })[0]).toContain(
			'not one of the two Sparks'
		);
		expect(problems({ units: { 'spark-619c': 'rm -rf /' } })[0]).toContain('not a mode name');
		expect(problems({ units: { 'spark-619c': 'no-such-mode' } })[0]).toContain(
			'is not a mode the catalogue knows'
		);
		expect(problems({ roles: { brain: { cartridge: 'openai/x' } } })[0]).toContain(
			'not a Spark cartridge'
		);
	});

	it('refuses a role no unit can serve: the wrong model, too little context, the wrong unit, no log-probabilities', () => {
		expect(problems({ roles: { brain: { cartridge: 'dgx-spark/quick-qwen' } } })[0]).toContain(
			'no unit it may use is set to serve'
		);
		expect(
			problems({
				units: { 'spark-619c': 'cpf-large' },
				roles: { brain: { cartridge: 'dgx-spark/giant-qwen', minContext: 16384 } }
			})[0]
		).toContain('needs 16384 tokens of context');
		expect(
			problems({
				units: { 'spark-619c': 'puzzle', 'spark-ef08': 'chat' },
				roles: { brain: { cartridge: 'dgx-spark/giant-qwen', units: ['spark-ef08'] } }
			})[0]
		).toContain('no unit it may use is set to serve');
		expect(
			problems({ roles: { reader: { cartridge: 'dgx-spark/giant-qwen', needsLogprobs: true } } })[0]
		).toContain('log-probabilities');
	});
});

describe('planning and verifying against a survey', () => {
	const bothPuzzle = [
		state('spark-619c', 'puzzle', [GIANT_MODEL]),
		state('spark-ef08', 'puzzle', [GIANT_MODEL])
	];

	it('keeps a unit already in the mode, switches the other, and says what it would stop and for how long', () => {
		const plan = planSparkPattern(sparkPatternById('brain-and-seats')!, bothPuzzle);
		expect(plan.changes).toBe(true);
		expect(plan.units.map((u) => [u.unit, u.action, u.from, u.to])).toEqual([
			['spark-619c', 'keep', 'puzzle', 'puzzle'],
			['spark-ef08', 'switch', 'puzzle', 'chat']
		]);
		expect(plan.units[1]!.stops).toEqual({ mode: 'puzzle', owner: 'puzzle' });
		expect(plan.minutes).toBe(sparkModeById('chat')!.loadMinutes);
	});

	it('plans nothing when the pattern is already up, and blocks on an unreachable unit', () => {
		const plan = planSparkPattern(sparkPatternById('reasoning-pair')!, bothPuzzle);
		expect(plan.changes).toBe(false);
		expect(plan.minutes).toBe(0);
		const down = planSparkPattern(sparkPatternById('reasoning-pair')!, [
			bothPuzzle[0]!,
			state('spark-ef08', 'unknown', [], false)
		]);
		expect(down.units[1]).toMatchObject({ action: 'unreachable' });
		expect(down.changes).toBe(true);
	});

	it('stands a unit down: off is kept only when nothing is running', () => {
		const idle = sparkPatternById('idle')!;
		const running = planSparkPattern(idle, bothPuzzle);
		expect(running.units.map((u) => u.action)).toEqual(['switch', 'switch']);
		expect(running.units[0]!.stops?.owner).toBe('puzzle');
		const stopped = planSparkPattern(idle, [
			state('spark-619c', 'off', []),
			state('spark-ef08', 'off', [])
		]);
		expect(stopped.changes).toBe(false);
	});

	it('reports each role as ready when a reachable unit serves its model with the context it needs', () => {
		const pattern = sparkPatternById('brain-and-seats')!;
		const half = Object.fromEntries(rolesReady(pattern.roles, bothPuzzle).map((r) => [r.role, r]));
		expect(half['brain']).toMatchObject({ ready: true, units: ['spark-619c'] });
		expect(half['seat']?.ready).toBe(false);
		expect(half['seat']?.why).toContain('spark-ef08: puzzle');
		const full = rolesReady(pattern.roles, [
			bothPuzzle[0]!,
			state('spark-ef08', 'chat', [QUICK_MODEL])
		]);
		expect(full.every((r) => r.ready)).toBe(true);
		const tight = rolesReady({ brain: { cartridge: 'dgx-spark/giant-qwen', minContext: 16384 } }, [
			state('spark-619c', 'cpf-large', [CPF_MODEL])
		]);
		expect(tight[0]!.ready).toBe(false);
	});

	it('infers a mode only when one mode serves exactly those names', () => {
		expect(inferMode([GIANT_MODEL, { ...GIANT_MODEL, id: 'tidy' }]).mode).toBe('puzzle');
		expect(inferMode([CPF_MODEL, { ...CPF_MODEL, id: 'puzzle-llm' }]).mode).toBe('cpf-large');
		expect(inferMode([QUICK_MODEL]).mode).toBe('chat');
		// `puzzle-llm` alone is a name two modes share: not a guess.
		expect(inferMode([GIANT_MODEL]).mode).toBe('unknown');
		expect(inferMode([])).toEqual({ mode: 'off', modeFrom: 'none' });
	});
});

describe('what a document asks of the Sparks', () => {
	it('finds the Spark cartridges wherever a design writes them, and the patterns that would serve them', () => {
		const design = {
			template: {
				brains: [
					{ id: 'live', tier: 'live', cartridgeId: 'dgx-spark/giant-qwen', cassette: 'a.json' },
					{ id: 'other', tier: 'live', cartridgeId: 'openai/quick-thinker' }
				],
				counterpart: { tier: 'live', cartridgeId: 'dgx-spark/quick-qwen' }
			}
		};
		expect(sparkCartridgesIn(design)).toEqual(['dgx-spark/giant-qwen', 'dgx-spark/quick-qwen']);
		expect(patternsServing(sparkCartridgesIn(design)).map((p) => p.id)).toEqual([
			'brain-and-seats'
		]);
		expect(patternsServing(['dgx-spark/giant-qwen']).map((p) => p.id)).toEqual([
			'reasoning-pair',
			'brain-and-seats',
			'reader-batch'
		]);
		expect(patternsServing(['nope/x'])).toEqual([]);
	});
});

describe('the survey', () => {
	it('asks each unit on its LAN name and then its Tailscale address, and says which answered', async () => {
		const asked: string[] = [];
		const fetch = (async (input: string | URL | Request) => {
			const url = String(input);
			asked.push(url);
			if (url.startsWith('http://spark-619c')) throw new TypeError('fetch failed');
			if (url.startsWith('http://100.119.19.90'))
				return Response.json({
					data: [{ id: 'qwen3.6', root: '/models/Qwen3.6-35B-A3B-NVFP4' }]
				});
			if (url.startsWith('http://spark-ef08'))
				return Response.json({
					data: [{ id: 'puzzle-llm', root: '/models/Qwen3.5-122B-A10B-NVFP4' }]
				});
			throw new TypeError('fetch failed');
		}) as typeof globalThis.fetch;
		const units = await surveySparks(fetch);
		expect(units.map((u) => [u.unit, u.reachable, u.via])).toEqual([
			['spark-619c', true, '100.119.19.90'],
			['spark-ef08', true, 'spark-ef08']
		]);
		expect(units[0]!.mode).toBe('chat');
		expect(asked).toContain('http://spark-619c:8000/v1/models');
	});

	it('marks a unit nobody answers for as unreachable', async () => {
		const fetch = (async () => {
			throw new TypeError('fetch failed');
		}) as typeof globalThis.fetch;
		const units = await surveySparks(fetch);
		expect(units.every((u) => !u.reachable && u.mode === 'unknown')).toBe(true);
	});
});

describe('spreading load across the units', () => {
	const urls = [
		'http://spark-619c:8000/v1',
		'http://spark-ef08:8000/v1',
		'http://100.119.19.90:8000/v1',
		'http://100.103.182.73:8000/v1'
	];
	const GIANT = 'Qwen3.5-122B-A10B-NVFP4';

	function fleet(opts: { down?: string[] } = {}) {
		const hits: string[] = [];
		const open: Array<() => void> = [];
		const fetch = (async (input: string | URL | Request) => {
			const url = String(input);
			const base = urls.find((b) => url.startsWith(b))!;
			if (opts.down?.some((d) => base.includes(d))) throw new TypeError('fetch failed');
			if (url.endsWith('/models'))
				return Response.json({
					data: [{ id: 'puzzle-llm', root: '/models/Qwen3.5-122B-A10B-NVFP4' }]
				});
			hits.push(base);
			// Hold the response open until released, as a long completion is.
			return new Response(
				new ReadableStream({
					start(controller) {
						open.push(() => {
							controller.enqueue(new TextEncoder().encode('ok'));
							controller.close();
						});
					}
				})
			);
		}) as typeof globalThis.fetch;
		return { fetch, hits, release: () => open.splice(0).forEach((r) => r()) };
	}
	const hostOf = (url: string) => url.replace('http://', '').split(':')[0];

	it('puts concurrent requests on the less loaded unit, and a lone request on the first as it always did', async () => {
		const { fetch, hits, release } = fleet();
		const transport = createSparkTransport({ baseUrls: urls, fetch });
		const calls = [
			await transport.post(GIANT, '/chat/completions', () => ({})),
			await transport.post(GIANT, '/chat/completions', () => ({})),
			await transport.post(GIANT, '/chat/completions', () => ({}))
		];
		expect(hits.map(hostOf)).toEqual(['spark-619c', 'spark-ef08', 'spark-619c']);
		expect(sparkLoad('spark-619c')).toBe(2);
		expect(sparkLoad('spark-ef08')).toBe(1);
		release();
		await Promise.all(calls.map((r) => r.response.text()));
		// Counts are released when the bodies are read.
		expect(sparkLoad('spark-619c')).toBe(0);
		expect(sparkLoad('spark-ef08')).toBe(0);
		// And one at a time goes to the first unit, every time.
		const alone = await transport.post(GIANT, '/chat/completions', () => ({}));
		release();
		await alone.response.text();
		expect(hostOf(hits.at(-1)!)).toBe('spark-619c');
	});

	it('keeps the configured order under the ordered strategy', async () => {
		const { fetch, hits, release } = fleet();
		const transport = createSparkTransport({ baseUrls: urls, fetch, strategy: 'ordered' });
		const calls = [];
		for (let i = 0; i < 3; i += 1)
			calls.push(await transport.post(GIANT, '/chat/completions', () => ({})));
		release();
		await Promise.all(calls.map((r) => r.response.text()));
		expect(new Set(hits)).toEqual(new Set(['http://spark-619c:8000/v1']));
	});

	it('still fails over when a unit is down, and counts a unit by identity, not by address', async () => {
		const { fetch, hits, release } = fleet({ down: ['spark-ef08', '100.103.182.73'] });
		const transport = createSparkTransport({ baseUrls: urls, fetch });
		const a = await transport.post(GIANT, '/chat/completions', () => ({}));
		const b = await transport.post(GIANT, '/chat/completions', () => ({}));
		expect(sparkLoad('spark-619c')).toBe(2);
		release();
		await Promise.all([a, b].map((r) => r.response.text()));
		expect(hits.every((h) => h.includes('spark-619c'))).toBe(true);
		expect(sparkLoad('spark-619c')).toBe(0);
	});
});
