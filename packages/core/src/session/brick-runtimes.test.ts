import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createPackRegistry, type PackRegistry } from '../pack-registry.js';
import type { AgentSpecV2 } from '../schemas/agent-spec-v2.js';
import type {
	BrickKindDefinition,
	BrickRuntime,
	CallContribution,
	SlotId
} from '../types/brick.js';
import type { Guardrail } from '../types/guardrail.js';
import {
	buildRuntimes,
	collectCalls,
	collectContext,
	collectGuardrails,
	collectSenses,
	collectState,
	collectWorldConfig,
	disposeRuntimes,
	notifyTickEnd,
	resolveReflex
} from './brick-runtimes.js';

/**
 * **Fitting the bricks** (`14-…` §2.1, WP14 slice 3a).
 *
 * Core's half of the open contract, tested with kinds core has never heard of —
 * which is the point. Every kind here is invented in this file: if any of it
 * needed `starter/llm` to work, the contract would not be open.
 */

const anyConfig = z.record(z.string(), z.unknown());

function kind(
	id: string,
	slot: SlotId,
	overrides: Partial<BrickKindDefinition> = {}
): BrickKindDefinition {
	return {
		id,
		slot,
		name: id,
		description: id,
		realName: id,
		realExplanation: id,
		configSchema: anyConfig,
		configVersion: 1,
		defaults: {},
		...overrides
	} as BrickKindDefinition;
}

function registryOf(...kinds: BrickKindDefinition[]): PackRegistry {
	const registry = createPackRegistry();
	registry.registerPack({
		id: 'test',
		name: 'Test',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		brickKinds: kinds
	});
	return registry;
}

function spec(bricks: AgentSpecV2['bricks']): AgentSpecV2 {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Testbot',
		schemaVersion: 2,
		bricks,
		goalCardId: 'test/card',
		identity: { displayName: 'Testbot', boxArtSeed: 'seed' },
		createdAt: '2026-08-13T09:00:00Z',
		updatedAt: '2026-08-13T09:00:00Z'
	};
}

const fitted = (slot: SlotId, kindId: string, config: Record<string, unknown> = {}) => ({
	slot,
	kind: kindId,
	configVersion: 1,
	config
});

const speaks = (line: string): BrickRuntime => ({
	contributeContext: () => ({ sections: [line] })
});

const context = {
	random: () => 0.5,
	getPolicyCard: () => undefined,
	getAction: () => undefined,
	fetch: () => Promise.reject(new Error('fetch is not used in these tests')),
	getCredential: () => undefined
};

describe('building runtimes', () => {
	it('builds one per fitted brick, handing each its own parsed config', () => {
		const seen: unknown[] = [];
		const registry = registryOf(
			kind('test/brain', 'brain', {
				configSchema: z.object({ mood: z.string() }),
				createRuntime: (config) => {
					seen.push(config);
					return {};
				}
			})
		);

		const built = buildRuntimes({
			spec: spec([fitted('brain', 'test/brain', { mood: 'cheerful' })]),
			registry,
			context
		});

		expect(built).toHaveLength(1);
		expect(built[0]?.kind).toBe('test/brain');
		expect(seen).toEqual([{ mood: 'cheerful' }]);
	});

	/**
	 * Slot order, not spec order. The prompt a bot reads should not change
	 * because somebody snapped their bricks on in a different sequence.
	 */
	it('orders runtimes by socket, whatever order the spec lists them in', () => {
		const registry = registryOf(
			kind('test/safety', 'safety', { createRuntime: () => ({}) }),
			kind('test/brain', 'brain', { createRuntime: () => ({}) }),
			kind('test/memory', 'memory', { createRuntime: () => ({}) })
		);

		const built = buildRuntimes({
			spec: spec([
				fitted('safety', 'test/safety'),
				fitted('memory', 'test/memory'),
				fitted('brain', 'test/brain')
			]),
			registry,
			context
		});

		expect(built.map((entry) => entry.slot)).toEqual(['brain', 'memory', 'safety']);
	});

	it('takes a v1 spec, because a bot on somebody’s shelf still has to run', () => {
		const registry = registryOf(kind('starter/llm', 'brain', { createRuntime: () => ({}) }));
		const built = buildRuntimes({
			spec: {
				id: '11111111-1111-4111-8111-111111111111',
				name: 'Old Timer',
				bricks: { llm: { cartridgeId: 'c', temperature: 0, maxTokens: 10, personality: '' } },
				goalCardId: 'test/card',
				createdAt: '2026-08-13T09:00:00Z',
				updatedAt: '2026-08-13T09:00:00Z',
				schemaVersion: 1
			},
			registry,
			context
		});
		expect(built.map((entry) => entry.kind)).toEqual(['starter/llm']);
	});

	/**
	 * All three are already blocking build problems the ribbon has reported.
	 * The session is not the place to re-litigate a build the user was told
	 * about; it runs the bot it was given or it does not start.
	 */
	it('passes over a kind no pack registered', () => {
		const built = buildRuntimes({
			spec: spec([fitted('brain', 'nobody/nothing')]),
			registry: registryOf(),
			context
		});
		expect(built).toEqual([]);
	});

	it('passes over a brick sitting in the wrong socket', () => {
		const registry = registryOf(kind('test/brain', 'brain', { createRuntime: () => ({}) }));
		const built = buildRuntimes({
			spec: spec([fitted('mobility', 'test/brain')]),
			registry,
			context
		});
		expect(built).toEqual([]);
	});

	it('passes over a config the kind will not accept', () => {
		const registry = registryOf(
			kind('test/brain', 'brain', {
				configSchema: z.object({ mood: z.string() }),
				createRuntime: () => ({})
			})
		);
		const built = buildRuntimes({
			spec: spec([fitted('brain', 'test/brain', { mood: 7 })]),
			registry,
			context
		});
		expect(built).toEqual([]);
	});

	/** Not an error: a brick that is pure configuration is legal (`14-…` §2.1). */
	it('leaves out a kind with no runtime, without complaint', () => {
		const registry = registryOf(kind('test/decor', 'equipment'));
		const built = buildRuntimes({
			spec: spec([fitted('equipment', 'test/decor')]),
			registry,
			context
		});
		expect(built).toEqual([]);
	});

	it('gives every runtime the same deterministic randomness', () => {
		// A brick cannot smuggle in `Math.random`: the only source it is given is
		// the one the session was built with (hard rule 5).
		const rolls: number[] = [];
		const registry = registryOf(
			kind('test/brain', 'brain', {
				createRuntime: (_config, ctx) => {
					rolls.push(ctx.random());
					return {};
				}
			})
		);
		buildRuntimes({ spec: spec([fitted('brain', 'test/brain')]), registry, context });
		expect(rolls).toEqual([0.5]);
	});
});

describe('resolving a reflex (WP30 stage A, If/Then)', () => {
	const observation = { channels: ['sight'], text: 'nothing nearby' };
	const reflexContext = { tick: 1, channels: ['sight'], observation };
	const proposes = (proposal: {
		kind: 'tool' | 'action';
		name: string;
		arguments: unknown;
		thought: string;
	}): BrickRuntime => ({
		contributeReflex: () => proposal
	});

	it('returns undefined when nothing is fitted, or nothing fitted has a reflex to offer', () => {
		expect(
			resolveReflex(
				[{ slot: 'mobility', kind: 'test/actions', name: 'a', runtime: {} }],
				reflexContext
			)
		).toBeUndefined();
	});

	it('returns the one fitted brick’s own proposal', () => {
		const proposal = {
			kind: 'action' as const,
			name: 'pick_up',
			arguments: { item: 'key' },
			thought: 'Saw the key. Rule: pick it up.'
		};
		expect(
			resolveReflex(
				[{ slot: 'mobility', kind: 'test/if-then', name: 'r', runtime: proposes(proposal) }],
				reflexContext
			)
		).toEqual(proposal);
	});

	it('the first fitted brick to propose one wins, in slot order — not a list to merge', () => {
		const first = {
			kind: 'action' as const,
			name: 'pick_up',
			arguments: {},
			thought: 'first'
		};
		const second = {
			kind: 'action' as const,
			name: 'move',
			arguments: {},
			thought: 'second'
		};
		expect(
			resolveReflex(
				[
					{ slot: 'mobility', kind: 'test/first', name: 'f', runtime: proposes(first) },
					{ slot: 'mobility', kind: 'test/second', name: 's', runtime: proposes(second) }
				],
				reflexContext
			)
		).toEqual(first);
	});

	it('asks nothing of a brick with no reflex hook', () => {
		expect(
			resolveReflex([{ slot: 'brain', kind: 'test/brain', name: 'b', runtime: {} }], reflexContext)
		).toBeUndefined();
	});
});

describe('collecting what the bricks contribute', () => {
	function built(...entries: Array<[SlotId, string, BrickRuntime]>) {
		return entries.map(([slot, kindId, runtime]) => ({
			slot,
			kind: kindId,
			name: kindId,
			runtime
		}));
	}

	it('concatenates sections in slot order', () => {
		const sections = collectContext(
			built(
				['brain', 'test/brain', speaks('About you: Terse.')],
				['memory', 'test/memory', speaks('You remember three turns.')]
			),
			{ tick: 1, channels: [] }
		).sections;

		expect(sections).toEqual(['About you: Terse.', 'You remember three turns.']);
	});

	it('skips a brick that contributes nothing this turn', () => {
		const sections = collectContext(
			built(
				['brain', 'test/brain', {}],
				['memory', 'test/memory', { contributeContext: () => ({}) }],
				['safety', 'test/safety', speaks('Careful now.')]
			),
			{ tick: 1, channels: [] }
		).sections;

		expect(sections).toEqual(['Careful now.']);
	});

	it('drops a blank section rather than putting an empty line in the prompt', () => {
		const sections = collectContext(built(['brain', 'test/brain', speaks('   ')]), {
			tick: 1,
			channels: []
		}).sections;
		expect(sections).toEqual([]);
	});

	it('tells each brick which tick it is, and what is being sensed', () => {
		const seen: unknown[] = [];
		collectContext(
			built(['brain', 'test/brain', { contributeContext: (tick) => (seen.push(tick), {}) }]),
			{ tick: 4, channels: ['starter/playroom/sight'] }
		);
		expect(seen).toEqual([{ tick: 4, channels: ['starter/playroom/sight'] }]);
	});
});

describe('collecting what the bricks offer', () => {
	function built(...entries: Array<[SlotId, string, BrickRuntime]>) {
		return entries.map(([slot, kindId, runtime]) => ({
			slot,
			kind: kindId,
			name: kindId,
			runtime
		}));
	}

	const offers = (contribution: CallContribution): BrickRuntime => ({
		contributeCalls: () => contribution
	});

	it('gathers tool and action ids separately, in slot order', () => {
		expect(
			collectCalls(
				built(
					['equipment', 'test/belt', offers({ toolIds: ['test/calculator'] })],
					['mobility', 'test/wheels', offers({ actionIds: ['move', 'say'] })]
				)
			)
		).toEqual({ toolIds: ['test/calculator'], actionIds: ['move', 'say'] });
	});

	it('lets one brick offer both, because nothing in the contract says otherwise', () => {
		expect(
			collectCalls(built(['equipment', 'test/swiss', offers({ toolIds: ['t'], actionIds: ['a'] })]))
		).toEqual({ toolIds: ['t'], actionIds: ['a'] });
	});

	it('asks nothing of a brick that offers nothing', () => {
		expect(collectCalls(built(['brain', 'test/brain', {}]))).toEqual({
			toolIds: [],
			actionIds: []
		});
	});

	/**
	 * Two bricks offering the same call is a build the wire-name collision check
	 * should refuse loudly. Quietly merging here would hide it.
	 */
	it('keeps a duplicate rather than papering over it', () => {
		expect(
			collectCalls(
				built(
					['equipment', 'test/belt', offers({ toolIds: ['test/calculator'] })],
					['mobility', 'test/pouch', offers({ toolIds: ['test/calculator'] })]
				)
			).toolIds
		).toEqual(['test/calculator', 'test/calculator']);
	});
});

describe('collecting what the bricks can sense', () => {
	const opens = (...channels: string[]): BrickRuntime => ({ contributeSenses: () => channels });

	it('gathers channels in slot order', () => {
		expect(
			collectSenses([
				{ slot: 'perception', kind: 'test/visor', name: 'v', runtime: opens('sight') },
				{ slot: 'equipment', kind: 'test/radar', name: 'r', runtime: opens('radar/sweep') }
			])
		).toEqual(['sight', 'radar/sweep']);
	});

	it('asks nothing of a brick with no senses to open', () => {
		expect(collectSenses([{ slot: 'brain', kind: 'test/brain', name: 'b', runtime: {} }])).toEqual(
			[]
		);
	});
});

describe('collecting the world config the bricks contribute (WP31 stage F)', () => {
	const configures = (bag: Record<string, unknown>): BrickRuntime => ({
		contributeWorldConfig: () => bag
	});

	it('merges every brick’s own bag into one, keyed by whatever id each entry names', () => {
		expect(
			collectWorldConfig([
				{
					slot: 'equipment',
					kind: 'test/radio',
					name: 'r',
					runtime: configures({ 'radio/send': { channel: 'work' } })
				},
				{
					slot: 'perception',
					kind: 'test/visor',
					name: 'v',
					runtime: configures({ sight: { keen: true } })
				}
			])
		).toEqual({ 'radio/send': { channel: 'work' }, sight: { keen: true } });
	});

	it('asks nothing of a brick with no world config to contribute', () => {
		expect(
			collectWorldConfig([{ slot: 'brain', kind: 'test/brain', name: 'b', runtime: {} }])
		).toEqual({});
	});

	/**
	 * A `Record` cannot hold two values under one key, so unlike
	 * `collectCalls`/`collectSenses` (which keep every duplicate for a build
	 * check to arbitrate) the later brick's entry simply wins — documented
	 * behaviour, not silent data loss, since two bricks configuring the same
	 * id is exactly as much a build question as two bricks offering the same
	 * tool.
	 */
	it('lets a later brick’s entry for the same key win over an earlier one', () => {
		expect(
			collectWorldConfig([
				{
					slot: 'equipment',
					kind: 'test/first',
					name: 'f',
					runtime: configures({ shared: 'first' })
				},
				{
					slot: 'mobility',
					kind: 'test/second',
					name: 's',
					runtime: configures({ shared: 'second' })
				}
			])
		).toEqual({ shared: 'second' });
	});
});

describe('collecting what the bricks report about their own live state (WP30 stage C)', () => {
	const reports = (state: unknown): BrickRuntime => ({ contributeState: () => state });

	it('collects one entry per brick that has something to report, tagged with slot and kind', () => {
		expect(
			collectState([
				{ slot: 'planner', kind: 'test/planner', name: 'p', runtime: reports({ steps: ['a'] }) },
				{ slot: 'brain', kind: 'test/brain', name: 'b', runtime: {} }
			])
		).toEqual([{ slot: 'planner', kind: 'test/planner', state: { steps: ['a'] } }]);
	});

	it('asks nothing of a brick that never implements the hook', () => {
		expect(collectState([{ slot: 'brain', kind: 'test/brain', name: 'b', runtime: {} }])).toEqual(
			[]
		);
	});

	it('omits a brick that implements the hook but has nothing new this tick', () => {
		expect(
			collectState([
				{ slot: 'planner', kind: 'test/planner', name: 'p', runtime: reports(undefined) }
			])
		).toEqual([]);
	});

	it('keeps a falsy-but-defined state — only `undefined` means "nothing to report"', () => {
		expect(
			collectState([{ slot: 'planner', kind: 'test/planner', name: 'p', runtime: reports(0) }])
		).toEqual([{ slot: 'planner', kind: 'test/planner', state: 0 }]);
	});
});

describe('collecting the rules the bricks install', () => {
	/**
	 * A stand-in for a real rule: `collectGuardrails` never looks inside one, so
	 * the identity is all the assertions need.
	 */
	const rule = (id: string): Guardrail => ({
		id,
		name: id,
		description: id,
		hooks: ['pre-act'],
		check: () => ({ allow: true as const })
	});

	const installs = (...ids: string[]): BrickRuntime => ({
		contributeGuardrails: () => ids.map(rule)
	});

	const idsOf = (guardrails: Guardrail[]) => guardrails.map((guardrail) => guardrail.id);

	it('gathers rules in slot order', () => {
		expect(
			idsOf(
				collectGuardrails([
					{ slot: 'safety', kind: 'test/warden', name: 'w', runtime: installs('warden/budget') },
					{ slot: 'brain', kind: 'test/brain', name: 'b', runtime: installs('brain/rule') }
				])
			)
		).toEqual(['warden/budget', 'brain/rule']);
	});

	/**
	 * The chain stops at the first non-allow verdict (`08-…` §2), so order is
	 * behaviour, not presentation. A brick owns the order of its own rules.
	 */
	it('keeps a brick’s own rules in the order it returned them', () => {
		expect(
			idsOf(
				collectGuardrails([
					{
						slot: 'safety',
						kind: 'test/warden',
						name: 'w',
						runtime: installs('blocklist', 'no-repetition', 'approval')
					}
				])
			)
		).toEqual(['blocklist', 'no-repetition', 'approval']);
	});

	/**
	 * The point of the hook. A Monitor brick is policy contributed by something
	 * that is not the Safety brick, which the old `guardrailsForSpec` compiler
	 * could not express at all.
	 */
	it('takes policy from any brick, not just the one in the safety socket', () => {
		expect(
			idsOf(
				collectGuardrails([
					{
						slot: 'perception',
						kind: 'test/monitor',
						name: 'm',
						runtime: installs('monitor/watch')
					}
				])
			)
		).toEqual(['monitor/watch']);
	});

	it('asks nothing of a brick with no policy to install', () => {
		expect(
			collectGuardrails([{ slot: 'brain', kind: 'test/brain', name: 'b', runtime: {} }])
		).toEqual([]);
	});
});

describe('the rest of the tick', () => {
	it('tells every brick how the tick went', () => {
		const onTickEnd = vi.fn();
		notifyTickEnd([{ slot: 'memory', kind: 'test/memory', name: 'm', runtime: { onTickEnd } }], {
			tick: 2,
			observation: 'saw a rug',
			thought: 'hmm'
		});
		expect(onTickEnd).toHaveBeenCalledWith({ tick: 2, observation: 'saw a rug', thought: 'hmm' });
	});

	it('is untroubled by a brick that does not care how the tick went', () => {
		expect(() =>
			notifyTickEnd([{ slot: 'brain', kind: 'test/brain', name: 'b', runtime: {} }], {
				tick: 1,
				observation: '',
				thought: ''
			})
		).not.toThrow();
	});

	it('lets every brick put itself away, and tolerates those with nothing to put', () => {
		const dispose = vi.fn();
		disposeRuntimes([
			{ slot: 'memory', kind: 'test/memory', name: 'm', runtime: { dispose } },
			{ slot: 'brain', kind: 'test/brain', name: 'b', runtime: {} }
		]);
		expect(dispose).toHaveBeenCalledOnce();
	});
});
