import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { buildSpec, planFor, runToCompletion } from '@craftabot/pack-starter/testing';
import { DEFAULT_NAMING_MISS_PATTERN, scoreRun } from './metrics.js';

/**
 * The metrics fold, tested two ways on purpose.
 *
 * **Hand-built traces** pin the arithmetic — they can express a loop, a wasted
 * tick or a denied approval exactly, with nothing else in the way.
 *
 * **Real runs** pin the fold to the engine. Every number here is only worth
 * anything if it counts the thing the engine actually emits, and a fixture is a
 * statement about what somebody *believed* the engine emits. The naming-miss
 * pattern is the sharpest case: it matches prose, so a reworded refusal would
 * silently take it to zero — and a scorecard full of zeroes reads like good
 * news. That one is pinned by driving a bot into a real miss.
 */

let seq = 0;
function event<T extends EngineEvent['type']>(type: T, payload: unknown, tick = 1): EngineEvent {
	seq += 1;
	return {
		id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
		runId: '11111111-1111-4111-8111-111111111111',
		agentId: '22222222-2222-4222-8222-222222222222',
		tick,
		timestamp: '2026-08-15T09:00:00.000Z',
		type,
		payload
	} as EngineEvent;
}

const acted = (name: string, args: unknown, ok: boolean, narration = '', tick = 1) =>
	event('action.performed', { name, arguments: args, result: { ok, narration } }, tick);
const tick = (n: number) => event('tick.started', {}, n);

describe('the shape of a run', () => {
	it('measures nothing from nothing, without dividing by zero', () => {
		const metrics = scoreRun([]);
		expect(metrics.ticksUsed).toBe(0);
		// NaN here would poison every average on the scorecard.
		expect(metrics.wastedTickRatio).toBe(0);
		expect(metrics.outcome).toBeUndefined();
		expect(metrics.firstProductiveTick).toBeUndefined();
	});

	it('counts turns, tokens and the ending', () => {
		const metrics = scoreRun([
			tick(1),
			event('think.completed', { response: { usage: { inputTokens: 10, outputTokens: 4 } } }),
			tick(2),
			event('think.completed', { response: { usage: { inputTokens: 12, outputTokens: 6 } } }),
			event('run.finished', { outcome: 'SUCCESS', ticks: 2, usage: {} })
		]);

		expect(metrics.ticksUsed).toBe(2);
		expect(metrics.tokensIn).toBe(22);
		expect(metrics.tokensOut).toBe(10);
		expect(metrics.outcome).toBe('SUCCESS');
	});

	it('notes when the bot first did something that worked', () => {
		const metrics = scoreRun([
			tick(1),
			acted('move', { direction: 'north' }, false, 'A wall.', 1),
			tick(2),
			acted('move', { direction: 'east' }, true, 'You roll east.', 2)
		]);
		expect(metrics.firstProductiveTick).toBe(2);
	});
});

describe('wasted ticks', () => {
	it('is the share of turns that achieved nothing', () => {
		const metrics = scoreRun([
			tick(1),
			acted('move', { direction: 'north' }, true, '', 1),
			tick(2),
			acted('pick_up', { item: 'ghost' }, false, '', 2),
			tick(3),
			acted('pick_up', { item: 'ghost' }, false, '', 3),
			tick(4),
			acted('say', { text: 'hello' }, true, '', 4)
		]);
		expect(metrics.wastedTickRatio).toBe(0.5);
	});

	it('counts a turn once however many things went wrong in it', () => {
		// Two refusals in one turn is still one wasted turn, not two.
		const metrics = scoreRun([
			tick(1),
			acted('pick_up', { item: 'ghost' }, false, '', 1),
			acted('pick_up', { item: 'spectre' }, false, '', 1)
		]);
		expect(metrics.wastedTickRatio).toBe(1);
	});

	it('treats a tool call as work done', () => {
		// The Sums card is won with the calculator. Scoring world actions alone
		// would file its best turn as wasted.
		const metrics = scoreRun([
			tick(1),
			event('tool.executed', { name: 'calculator', arguments: {}, result: '391', durationMs: 1 })
		]);
		expect(metrics.wastedTickRatio).toBe(0);
		expect(metrics.firstProductiveTick).toBe(1);
	});
});

describe('the loop score', () => {
	it('sees the identical thing done again', () => {
		const metrics = scoreRun([
			acted('move', { direction: 'north' }, true),
			acted('move', { direction: 'north' }, true),
			acted('move', { direction: 'north' }, true)
		]);
		expect(metrics.loop.longestStreak).toBe(3);
	});

	it('does not call a different argument the same call', () => {
		// By name alone this is a streak of four and every `move` in every run
		// would score as looping.
		const metrics = scoreRun([
			acted('move', { direction: 'north' }, true),
			acted('move', { direction: 'south' }, true),
			acted('move', { direction: 'north' }, true),
			acted('move', { direction: 'south' }, true)
		]);
		expect(metrics.loop.longestStreak).toBe(1);
	});

	it('is not fooled by key order', () => {
		// A provider that serialises its arguments differently would otherwise
		// look like a bot that had stopped repeating itself.
		const metrics = scoreRun([
			acted('put_down', { item: 'block', container: 'chest' }, true),
			acted('put_down', { container: 'chest', item: 'block' }, true)
		]);
		expect(metrics.loop.longestStreak).toBe(2);
	});

	it('handles the argument shapes a provider can actually send', () => {
		// Tool arguments are `unknown` on the wire: a list, a bare value and a
		// missing argument list are all things a model has produced.
		const metrics = scoreRun([
			acted('say', ['a', 'b'], true),
			acted('say', ['a', 'b'], true),
			acted('celebrate', undefined, true),
			acted('celebrate', undefined, true),
			acted('shout', null, true)
		]);
		expect(metrics.loop.longestStreak).toBe(2);
	});

	it('counts a failure repeated, not a failure had', () => {
		// Failing once is information. Failing the same way twice is the bot not
		// using it — so the first failure is free and the repeat is the score.
		const once = scoreRun([acted('pick_up', { item: 'ghost' }, false)]);
		expect(once.loop.repeatedFailures).toBe(0);

		const twice = scoreRun([
			acted('pick_up', { item: 'ghost' }, false),
			acted('move', { direction: 'north' }, true),
			acted('pick_up', { item: 'ghost' }, false)
		]);
		// Non-adjacent, so the streak stays at 1 and only the repeat count moves.
		expect(twice.loop).toEqual({ longestStreak: 1, repeatedFailures: 1 });
	});
});

describe('naming trouble', () => {
	it('separates a name that matched nothing from one that matched several', () => {
		const metrics = scoreRun([
			acted('pick_up', { item: 'ghost' }, false, 'You look around for "ghost" and cannot find it.'),
			event('action.performed', {
				name: 'pick_up',
				arguments: { item: 'block' },
				result: {
					ok: false,
					narration: '"block" could mean block A or block B. Say which one.',
					didYouMean: ['block A', 'block B']
				}
			})
		]);
		expect(metrics.namingMisses).toBe(1);
		expect(metrics.namingAmbiguities).toBe(1);
	});

	it('does not count trouble on an action that worked', () => {
		const metrics = scoreRun([acted('say', { text: 'I cannot find it' }, true, 'You say, "..."')]);
		expect(metrics.namingMisses).toBe(0);
	});

	it('takes a pattern for a world that words its refusals differently', () => {
		const metrics = scoreRun([acted('grab', { thing: 'x' }, false, 'No such widget, chief.')], {
			namingMissPattern: /no such widget/i
		});
		expect(metrics.namingMisses).toBe(1);
	});
});

describe('governance', () => {
	it('counts trips by rule, because which rule fired is the point', () => {
		const trip = (guardrailId: string) =>
			event('guardrail.tripped', { guardrailId, hook: 'pre-act', reason: 'no' });
		const metrics = scoreRun([
			trip('starter/step-budget'),
			trip('starter/no-teddy-snacks'),
			trip('starter/step-budget')
		]);
		expect(metrics.guardrailTrips).toEqual({
			'starter/step-budget': 2,
			'starter/no-teddy-snacks': 1
		});
	});

	it('counts what was asked and what was refused', () => {
		const metrics = scoreRun([
			event('approval.requested', { proposed: {}, reason: 'r' }),
			event('approval.resolved', { approved: false }),
			event('approval.requested', { proposed: {}, reason: 'r' }),
			event('approval.resolved', { approved: true })
		]);
		expect(metrics.approvalsRequested).toBe(2);
		expect(metrics.approvalsDenied).toBe(1);
	});
});

describe('against the engine itself', () => {
	/**
	 * The fixtures above are all statements about what the engine emits. These
	 * two check that belief against the engine.
	 */
	it('scores a perfect run as perfect', async () => {
		const run = await runToCompletion({
			script: obedient(planFor('starter/say-hello')),
			spec: buildSpec({ goalCardId: 'starter/say-hello' })
		});
		const metrics = scoreRun(run.events);

		expect(metrics.outcome).toBe('SUCCESS');
		// The solvability suite proves this plan wastes no turn; the metric had
		// better agree, or the two disagree about the same run.
		expect(metrics.wastedTickRatio).toBe(0);
		expect(metrics.namingMisses).toBe(0);
		expect(metrics.firstProductiveTick).toBe(1);
		expect(metrics.tokensIn).toBeGreaterThan(0);
	});

	it('recognises a real naming miss in the world’s own words', async () => {
		// The pattern matches prose, so this is the test that keeps it honest: a
		// reworded refusal fails here rather than quietly zeroing the metric.
		const run = await runToCompletion({
			script: obedient([
				{ say: 'I want the thing.', call: 'pick_up', args: { item: 'wibble' } },
				{ say: 'Never mind.', call: 'celebrate' }
			]),
			spec: buildSpec({ goalCardId: 'starter/free-play' }),
			stepLimit: 4
		});

		const refusal = run
			.byType('action.performed')
			.map((e) => (e.payload as { result: { ok: boolean; narration: string } }).result)
			.find((result) => !result.ok);

		expect(refusal, 'the world accepted a nonsense name').toBeDefined();
		expect(
			DEFAULT_NAMING_MISS_PATTERN.test(refusal!.narration),
			`the world now says "${refusal?.narration}", which the miss pattern no longer matches`
		).toBe(true);
		expect(scoreRun(run.events).namingMisses).toBeGreaterThan(0);
	});
});
