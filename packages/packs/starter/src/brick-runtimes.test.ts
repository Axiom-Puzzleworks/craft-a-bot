import {
	buildAgentCard,
	buildRuntimes,
	collectCalls,
	collectContext,
	collectSenses,
	createPackRegistry,
	describeFittedBricks,
	migrateAgentSpec,
	type AgentSpecV2
} from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import starterPack from './index.js';
import { buildSpec } from './session/harness.js';

/**
 * **The six bricks, describing and contributing for themselves** (WP14 slice 3a).
 *
 * Both of these used to be `if` chains in core: `describeFittedBricks` knew all
 * six bricks by name, and the loop read `spec.bricks.llm?.personality` directly.
 * A seventh brick could join neither — `12-…` D11, in the one place a user
 * actually reads the consequence.
 *
 * Tested here rather than in core because the *phrases* are starter content.
 * Core's job is to ask each brick and put the answers in order, which its own
 * suite covers with kinds it invents.
 */

function registry() {
	const built = createPackRegistry();
	built.registerPack(starterPack);
	return built;
}

function v2(spec: ReturnType<typeof buildSpec>): AgentSpecV2 {
	const migrated = migrateAgentSpec(spec);
	if ('kind' in migrated) throw new Error(migrated.message);
	return migrated;
}

describe('what a bot says it was built with', () => {
	it('lists every fitted brick in kit language, in socket order', () => {
		const spec = v2(
			buildSpec({
				memory: { windowSize: 10, notebook: true },
				tools: ['starter/calculator'],
				safety: { maxTicks: 30, blockedActions: [], approvalMode: false }
			})
		);

		expect(describeFittedBricks(spec, registry())).toEqual([
			'a brain (LLM)',
			'memory of your last 10 turns, and a notebook',
			'a tool belt',
			'senses',
			'hands and wheels',
			'a safety brick watching over you'
		]);
	});

	it('mentions the notebook only when there is one', () => {
		const spec = v2(buildSpec({ memory: { windowSize: 3, notebook: false }, llm: false }));
		expect(describeFittedBricks(spec, registry())).toContain('memory of your last 3 turns');
	});

	/** A belt with nothing on it is on the chassis and carrying nothing. */
	it('passes over a brick that is fitted but switched entirely off', () => {
		const spec = v2(buildSpec({ llm: false, memory: null, senses: [], actions: [] }));
		spec.bricks.push({
			slot: 'equipment',
			kind: 'starter/tools',
			configVersion: 1,
			config: { enabled: [] }
		});
		expect(describeFittedBricks(spec, registry())).toEqual(['nothing much, honestly']);
	});

	it('is honest about a bot built from nothing', () => {
		const bare = v2(buildSpec({ llm: false, memory: null, senses: [], actions: [] }));
		expect(describeFittedBricks(bare, registry())).toEqual(['nothing much, honestly']);
	});

	it('says nothing about a brick from a pack it has not got', () => {
		// Rather than inventing a name for it. `validateSpec` has already told the
		// user the brick is missing; the bot's own prompt should not claim to have
		// something that will never act.
		const spec = v2(buildSpec({ llm: false, memory: null, senses: [], actions: [] }));
		spec.bricks.push({ slot: 'brain', kind: 'nobody/nothing', configVersion: 1, config: {} });
		expect(describeFittedBricks(spec, registry())).toEqual(['nothing much, honestly']);
	});
});

describe('what the bricks contribute to the prompt', () => {
	const sections = (spec: AgentSpecV2) =>
		collectContext(
			buildRuntimes({
				spec,
				registry: registry(),
				context: {
					random: () => 0,
					getPolicyCard: () => undefined,
					getAction: () => undefined,
					fetch: () => Promise.reject(new Error('fetch is not used in these tests')),
					getCredential: () => undefined
				}
			}),
			{
				tick: 1,
				channels: []
			}
		).sections;

	it('gives the Brain brick’s personality its own section', () => {
		expect(sections(v2(buildSpec({ personality: 'Cheerful and literal.' })))).toEqual([
			'About you: Cheerful and literal.'
		]);
	});

	it('contributes nothing for a personality that is only whitespace', () => {
		expect(sections(v2(buildSpec({ personality: '   ' })))).toEqual([]);
	});

	it('contributes nothing at all from a bot with no brain', () => {
		expect(sections(v2(buildSpec({ llm: false })))).toEqual([]);
	});
});

describe('what the bricks offer the model', () => {
	const offered = (spec: AgentSpecV2) =>
		collectCalls(
			buildRuntimes({
				spec,
				registry: registry(),
				context: {
					random: () => 0,
					getPolicyCard: () => undefined,
					getAction: () => undefined,
					fetch: () => Promise.reject(new Error('fetch is not used in these tests')),
					getCredential: () => undefined
				}
			})
		);

	it('puts the Equipment brick’s tools on the belt and the Mobility brick’s actions on the wheels', () => {
		const spec = v2(
			buildSpec({ tools: ['starter/calculator'], actions: ['starter/playroom/move'] })
		);
		expect(offered(spec)).toEqual({
			toolIds: ['starter/calculator'],
			actionIds: ['starter/playroom/move']
		});
	});

	/** The checkboxes are for taking capabilities *away* (02-AGENT-MODEL.md §2.5). */
	it('offers nothing from a brick with everything unticked', () => {
		expect(offered(v2(buildSpec({ actions: [] })))).toEqual({ toolIds: [], actionIds: [] });
	});

	it('offers nothing at all from a bot with neither brick fitted', () => {
		const bare = v2(buildSpec({ llm: false, memory: null, senses: [], actions: [] }));
		expect(offered(bare)).toEqual({ toolIds: [], actionIds: [] });
	});
});

describe('what the bricks let a bot sense', () => {
	it('opens the channels the Eyes & Ears brick names', () => {
		const spec = v2(buildSpec({ senses: ['starter/playroom/sight'] }));
		const runtimes = buildRuntimes({
			spec,
			registry: registry(),
			context: {
				random: () => 0,
				getPolicyCard: () => undefined,
				getAction: () => undefined,
				fetch: () => Promise.reject(new Error('fetch is not used in these tests')),
				getCredential: () => undefined
			}
		});
		expect(collectSenses(runtimes)).toEqual(['starter/playroom/sight']);
	});

	it('opens nothing for a bot with no perception brick', () => {
		const bare = v2(buildSpec({ llm: false, memory: null, senses: [], actions: [] }));
		expect(
			collectSenses(
				buildRuntimes({
					spec: bare,
					registry: registry(),
					context: {
						random: () => 0,
						getPolicyCard: () => undefined,
						getAction: () => undefined,
						fetch: () => Promise.reject(new Error('fetch is not used in these tests')),
						getCredential: () => undefined
					}
				})
			)
		).toEqual([]);
	});
});

/**
 * `buildAgentCard` (WP33 stage A, `14-…` §5.8) proven against real starter
 * content — `core`'s own suite (`persistence/agent-card.test.ts`) covers the
 * mechanism with kinds it invents; this is the "phrases are starter content"
 * half this file's own header comment already draws for `describeFittedBricks`.
 */
describe('a bot’s own passport', () => {
	it('describes every fitted brick the same way the system prompt does', () => {
		const spec = v2(
			buildSpec({
				memory: { windowSize: 10, notebook: true },
				tools: ['starter/calculator'],
				safety: { maxTicks: 30, blockedActions: [], approvalMode: false }
			})
		);

		const card = buildAgentCard(spec, registry());
		expect(card.bricks.map((brick) => brick.description)).toEqual([
			'a brain (LLM)',
			'memory of your last 10 turns, and a notebook',
			'a tool belt',
			'senses',
			'hands and wheels',
			'a safety brick watching over you'
		]);
	});

	it('names starter as the provenance of every brick a plain bot carries', () => {
		const spec = v2(buildSpec({ memory: { windowSize: 3, notebook: false } }));
		const card = buildAgentCard(spec, registry());

		expect(Object.values(card.provenance.brickKinds).every((packId) => packId === 'starter')).toBe(
			true
		);
		expect(card.provenance.packs['starter']).toBeDefined();
	});

	/** Radio's own `describeFitted` is config-dependent — real proof the card reads live config, not just a kind's static name. */
	it('reads a Radio brick’s own channel and trust list off its real config', () => {
		const spec = v2(buildSpec({ llm: false, memory: null, senses: [], actions: [] }));
		spec.bricks.push({
			slot: 'equipment',
			kind: 'starter/radio',
			configVersion: 1,
			config: { channel: 'work', allowFrom: ['11111111-1111-4111-8111-111111111111'] }
		});

		const card = buildAgentCard(spec, registry());
		const radio = card.bricks.find((brick) => brick.kind === 'starter/radio');
		expect(radio?.description).toBe('listens on channel "work", trusting one other robot');
	});
});
