import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@craftabot/core';
import type { MockScript, MockTurn } from '@craftabot/core/testing';
import { buildSpec, planFor, runToCompletion } from '@craftabot/pack-starter/testing';
import { DEFAULT_NOISE, scriptedNoisy, scriptedOptimal } from './brains.js';
import { scoreRun } from './metrics.js';

/**
 * The noisy tier has exactly two properties worth testing, and they pull in
 * opposite directions:
 *
 * 1. **It is reproducible.** A seed is a promise that a cell can be re-run and
 *    a regression re-examined. A brain that drifted would make every baseline
 *    meaningless and every investigation impossible.
 * 2. **It actually degrades.** A "noisy" brain that quietly behaves optimally
 *    passes every test about determinism and measures nothing at all — the
 *    matrix would fill with healthy numbers that say only that the plans are
 *    correct, which the solvability suite already proved for free.
 *
 * The second is the one that would rot silently, so it is checked against real
 * runs rather than against the script.
 */

const SAY_HELLO = planFor('starter/say-hello');

/** The function form, so a script can be interrogated turn by turn. */
function turnsOf(script: MockScript, count: number): MockTurn[] {
	if (Array.isArray(script)) return script.slice(0, count);
	return Array.from({ length: count }, (_, index) => script({} as ChatRequest, index));
}

describe('scripted-optimal', () => {
	it('is the plan, exactly', () => {
		const turns = turnsOf(scriptedOptimal(SAY_HELLO), SAY_HELLO.length);
		expect(turns.map((t) => t.toolCall?.name)).toEqual(SAY_HELLO.map((step) => step.call));
	});

	it('wins the card without wasting a turn', async () => {
		const run = await runToCompletion({
			script: scriptedOptimal(SAY_HELLO),
			spec: buildSpec({ goalCardId: 'starter/say-hello' })
		});
		const metrics = scoreRun(run.events);
		expect(metrics.outcome).toBe('SUCCESS');
		expect(metrics.wastedTickRatio).toBe(0);
	});
});

describe('scripted-noisy is reproducible', () => {
	it('gives the same wrong bot for the same seed', () => {
		const a = turnsOf(scriptedNoisy(SAY_HELLO, { seed: 7 }), 12);
		const b = turnsOf(scriptedNoisy(SAY_HELLO, { seed: 7 }), 12);
		expect(a).toEqual(b);
	});

	it('gives a different one for a different seed', () => {
		// Not a promise that every pair differs — with modest rates two seeds can
		// legitimately produce the same run — but across a spread they must not
		// all be identical, or the seed axis of the matrix is decoration.
		const shapes = new Set(
			[1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
				JSON.stringify(turnsOf(scriptedNoisy(SAY_HELLO, { seed }), 12))
			)
		);
		expect(shapes.size).toBeGreaterThan(1);
	});

	it('re-runs a whole session identically', async () => {
		const run = (seed: number) =>
			runToCompletion({
				script: scriptedNoisy(planFor('starter/snack'), { seed }),
				spec: buildSpec({ goalCardId: 'starter/snack' })
			});

		const first = scoreRun((await run(42)).events);
		const second = scoreRun((await run(42)).events);
		expect(second).toEqual(first);
	});
});

describe('scripted-noisy actually degrades', () => {
	/**
	 * Twenty seeds, which is the matrix's own cell count (`13-…` §8), against a
	 * card the optimal bot wins every time in four turns.
	 */
	const SEEDS = Array.from({ length: 20 }, (_, index) => index + 1);

	async function noisyRuns(goalCardId: string) {
		return Promise.all(
			SEEDS.map(async (seed) =>
				scoreRun(
					(
						await runToCompletion({
							script: scriptedNoisy(planFor(goalCardId), { seed }),
							spec: buildSpec({ goalCardId })
						})
					).events
				)
			)
		);
	}

	it('is worse than optimal without being useless', async () => {
		const runs = await noisyRuns('starter/say-hello');
		const wins = runs.filter((run) => run.outcome === 'SUCCESS').length;

		// Both bounds matter. A noisy bot that never fails measures nothing; one
		// that never succeeds measures nothing either, and would make every card
		// look equally badly explained.
		expect(wins).toBeGreaterThan(0);
		expect(wins).toBeLessThan(SEEDS.length);
	});

	it('wastes turns the optimal bot does not', async () => {
		const runs = await noisyRuns('starter/say-hello');
		const wasted = runs.reduce((total, run) => total + run.wastedTickRatio, 0) / runs.length;
		expect(wasted).toBeGreaterThan(0);
	});

	it('gets names wrong in a way the world really refuses', async () => {
		// This is what proves `corrupt()` produces genuine near misses. The world's
		// resolver matches on containment and on words in any order, so a
		// corruption that happened to still resolve would leave the misname rate
		// injected but unobservable — noise that the metric cannot see.
		const runs = await noisyRuns('starter/snack');
		const misses = runs.reduce((total, run) => total + run.namingMisses, 0);
		expect(misses).toBeGreaterThan(0);
	});

	it('leaves the rates in one place, because baselines depend on them', () => {
		// Stored baselines are only comparable against the instrument that
		// produced them. If these change, every baseline needs re-recording — so
		// the constant is asserted rather than merely exported.
		expect(DEFAULT_NOISE).toEqual({ misname: 0.12, wastedMove: 0.12, prematureCelebrate: 0.04 });
	});
});
