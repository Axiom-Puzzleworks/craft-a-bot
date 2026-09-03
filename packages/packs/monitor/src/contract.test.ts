import { describe, expect, it } from 'vitest';
import {
	createPackRegistry,
	createSession,
	describeFittedBricks,
	validateSpec,
	type AgentSpecV2,
	type EngineEvent,
	type FittedBrick
} from '@craftabot/core';
import { createMockProvider, createTestClock, obedient, wanderer } from '@craftabot/core/testing';
import starterPack from '@craftabot/pack-starter';
import monitorPack from './index.js';

/**
 * **The WP14 definition of done, as one test file.**
 *
 * *"Monitor-brick prototype builds against the contract with no core edits."*
 *
 * The prototype is `@craftabot/pack-monitor`, a package that depends on
 * `@craftabot/core` and `zod` and nothing else. That it *compiles* is already
 * most of the claim — it can only reach what core exports. What is left is to
 * show it genuinely works: that a bot with a Watchbot on its chest validates,
 * runs, and leaves the Watchbot's observations in the trace.
 *
 * Every assertion below is about a brick **core has never heard of**, exercised
 * through the same registry, validator and session the workbench uses.
 */

const CARTRIDGES = {
	id: 'test',
	name: 'Test cartridges',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	cartridges: [
		{
			id: 'test/mock-brain',
			providerId: 'mock',
			model: 'mock-1',
			displayName: 'Mock Brain',
			blurb: 'Scripted, deterministic, never sends anything anywhere.',
			stats: { words: 2 as const, reasoning: 2 as const, speed: 3 as const },
			costHint: 'low' as const,
			defaults: { temperature: 0, maxTokens: 256 }
		}
	]
};

/** A workbench with the expansion pack installed, exactly as the app would. */
function registry() {
	const built = createPackRegistry();
	built.registerPack(starterPack);
	built.registerPack({ ...CARTRIDGES, cartridges: [...CARTRIDGES.cartridges] });
	built.registerPack(monitorPack);
	return built;
}

const qualified = (id: string) => `starter/playroom/${id}`;

function bot(bricks: FittedBrick[], goalCardId = 'starter/say-hello'): AgentSpecV2 {
	return {
		id: '44444444-4444-4444-8444-444444444444',
		name: 'Watchedbot',
		schemaVersion: 2,
		bricks,
		goalCardId,
		identity: { displayName: 'Watchedbot', boxArtSeed: 'seed' },
		createdAt: '2026-08-13T09:00:00Z',
		updatedAt: '2026-08-13T09:00:00Z'
	};
}

const BRAIN: FittedBrick = {
	slot: 'brain',
	kind: 'starter/llm',
	configVersion: 1,
	config: { cartridgeId: 'test/mock-brain', temperature: 0, maxTokens: 256, personality: '' }
};

const WHEELS: FittedBrick = {
	slot: 'mobility',
	kind: 'starter/actions',
	configVersion: 1,
	config: { enabled: ['move', 'say'].map(qualified) }
};

const watchbot = (watchFor: string[]): FittedBrick => ({
	slot: 'safety',
	kind: 'monitor/watchbot',
	configVersion: 1,
	config: { watchFor }
});

async function run(spec: AgentSpecV2, script: Parameters<typeof createMockProvider>[0]['script']) {
	const clock = createTestClock();
	const session = createSession({
		spec,
		registry: registry(),
		provider: createMockProvider({ script }),
		options: { now: clock.now, newId: clock.newId, random: clock.random }
	});

	const events: EngineEvent[] = [];
	session.events.onAny((event) => events.push(event));
	session.start('step');
	for (let step = 0; step < 12; step++) {
		const result = await session.step();
		if (result.outcome) break;
	}
	return events;
}

/** Every note a Watchbot rule left in the trace. */
function notes(events: EngineEvent[]): string[] {
	return events
		.filter((event) => event.type === 'guardrail.checked')
		.filter((event) =>
			event.type === 'guardrail.checked' ? event.payload.guardrailId.startsWith('monitor/') : false
		)
		.map((event) =>
			event.type === 'guardrail.checked' && 'note' in event.payload.verdict
				? (event.payload.verdict.note ?? '')
				: ''
		)
		.filter((note) => note !== '');
}

describe('a brick from a pack core has never heard of', () => {
	it('is installed by the registry like any other', () => {
		const kind = registry().getBrickKind('monitor/watchbot');
		expect(kind?.name).toBe('Watchbot');
		expect(kind?.slot).toBe('safety');
	});

	it('passes the build checks', () => {
		const problems = validateSpec(
			bot([BRAIN, WHEELS, watchbot(['monitor/going-in-circles'])]),
			registry()
		);
		expect(problems).toEqual([]);
	});

	/** The fourth question core delegates: only this pack knows what a rule id is. */
	it('reports its own config problem, without blocking the build', () => {
		const problems = validateSpec(bot([BRAIN, WHEELS, watchbot(['monitor/nonsense'])]), registry());
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatchObject({ severity: 'warning', slot: 'safety' });
		expect(problems[0]?.message).toContain('monitor/nonsense');
	});

	it('tells the bot it is being watched, in the bot’s own prompt', () => {
		const fitted = describeFittedBricks(
			bot([BRAIN, WHEELS, watchbot(['monitor/all-talk'])]),
			registry()
		);
		expect(fitted).toContain('a watchbot keeping an eye on you');
	});
});

describe('a Watchbot on a running bot', () => {
	/**
	 * The claim the whole work package turns on: a brick nobody wrote engine code
	 * for contributes policy, and that policy runs.
	 */
	it('writes what it noticed into the trace', async () => {
		const events = await run(
			bot([BRAIN, WHEELS, watchbot(['monitor/going-in-circles'])]),
			// East three times: nothing forbidden, and plainly a bot in a rut.
			obedient([
				{ say: 'Off I go.', call: 'move', args: { direction: 'east' } },
				{ say: 'Still going.', call: 'move', args: { direction: 'east' } },
				{ say: 'Onwards.', call: 'move', args: { direction: 'east' } }
			])
		);

		expect(notes(events).some((note) => note.includes('Round in circles'))).toBe(true);
	});

	/** Read-only is the point: it notices and the run carries on regardless. */
	it('never stops the run it is watching', async () => {
		const events = await run(
			bot([BRAIN, WHEELS, watchbot([...['monitor/going-in-circles', 'monitor/all-talk']])]),
			wanderer()
		);

		expect(events.some((event) => event.type === 'guardrail.tripped')).toBe(false);
		const finished = events.find((event) => event.type === 'run.finished');
		expect(finished?.type === 'run.finished' ? finished.payload.outcome : undefined).not.toBe(
			'STOPPED_BY_GUARDRAIL'
		);
	});

	it('checks at post-act, after the thing it is judging has happened', async () => {
		const events = await run(
			bot([BRAIN, WHEELS, watchbot(['monitor/going-in-circles'])]),
			obedient([{ say: 'Off I go.', call: 'move', args: { direction: 'east' } }])
		);

		const checks = events.filter(
			(event) =>
				event.type === 'guardrail.checked' && event.payload.guardrailId.startsWith('monitor/')
		);
		expect(checks.length).toBeGreaterThan(0);
		for (const check of checks) {
			expect(check.type === 'guardrail.checked' ? check.payload.hook : undefined).toBe('post-act');
		}
	});

	it('watches for nothing at all when it is switched off', async () => {
		const events = await run(
			bot([BRAIN, WHEELS, watchbot([])]),
			obedient([{ say: 'Off I go.', call: 'move', args: { direction: 'east' } }])
		);
		expect(
			events.filter(
				(event) =>
					event.type === 'guardrail.checked' && event.payload.guardrailId.startsWith('monitor/')
			)
		).toHaveLength(0);
	});
});

describe('the Watchbot beside the Safety Brick', () => {
	/**
	 * Both live in the chest socket. V1's one-per-socket rule (`14-…` §2.3)
	 * once made fitting one exclude the other; WP40 (`26-…` §6.13) gave the
	 * socket a capacity of four instead of the second chest socket `14-…` §5.3
	 * envisaged. So what is asserted now is the honest answer the other way:
	 * the pair validates, and both chains run — the floor's rules first, the
	 * Watchbot's after, because that is the order they were fitted in.
	 */
	const pair = () =>
		bot([
			BRAIN,
			WHEELS,
			{
				slot: 'safety',
				kind: 'starter/safety',
				configVersion: 1,
				config: { maxTicks: 30, blockedActions: [], approvalMode: false }
			},
			watchbot(['monitor/all-talk'])
		]);

	it('is accepted as a second brick in the one socket that holds a stack', () => {
		const problems = validateSpec(pair(), registry());
		expect(problems.some((problem) => problem.code === 'slot-already-filled')).toBe(false);
	});

	it('runs beside it, after it', async () => {
		const events = await run(
			pair(),
			obedient([{ say: 'Off I go.', call: 'move', args: { direction: 'east' } }])
		);
		const ids = events
			.filter((event) => event.type === 'guardrail.checked')
			.map((event) => (event.type === 'guardrail.checked' ? event.payload.guardrailId : ''));
		expect(ids.some((id) => id.startsWith('safety/'))).toBe(true);
		expect(ids.some((id) => id.startsWith('monitor/'))).toBe(true);
		const firstMonitor = ids.findIndex((id) => id.startsWith('monitor/'));
		expect(ids.slice(0, firstMonitor).some((id) => id.startsWith('safety/'))).toBe(true);
	});
});
