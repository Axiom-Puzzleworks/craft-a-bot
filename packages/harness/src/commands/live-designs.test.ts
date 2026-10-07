import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareReplay, effectKey, replayProblems } from '../../../../scripts/live-check.mjs';
import {
	LIVE,
	liveDesign,
	liveIdOf,
	CARTRIDGE,
	MAX_TOKENS
} from '../../../../scripts/live-designs.mjs';

/**
 * **The live designs** (WP168): derived from their base designs, one live brain
 * naming its cassette, a book at its own size; and the replay check, which is
 * exact where the reduced reference experiments are held only to a shape.
 */
describe('the live designs', () => {
	it('every one is its base design with the brain factor removed and one live brain on the 122B', () => {
		for (const entry of LIVE) {
			const base = JSON.parse(
				readFileSync(
					resolve(import.meta.dirname, '../../../../experiments', `${entry.base}.json`),
					'utf8'
				)
			);
			const live = liveDesign(entry);
			expect(live.id).toBe(liveIdOf(entry));
			expect(live.design.factors.map((f: { axis: string }) => f.axis)).toEqual(
				base.design.factors
					.map((f: { axis: string }) => f.axis)
					.filter((a: string) => a !== 'brain')
			);
			expect(live.design.baseline).not.toHaveProperty('brain');
			expect(live.design.template.brains).toEqual([
				{
					id: 'live',
					tier: 'live',
					cartridgeId: CARTRIDGE,
					cassette: `docs/evidence/live/${liveIdOf(entry)}/${liveIdOf(entry)}.provider-cassette.json`
				}
			]);
			expect(live.design.template.source.population.size).toBe(entry.size);
			expect(live.design.template.budget.maxLiveCells).toBeGreaterThan(0);
			// The rest of the template is the base design's, untouched.
			expect(live.design.template.builds).toEqual(
				base.design.template.builds.map((build: { overrides?: object }) => ({
					...build,
					overrides: { ...build.overrides, maxTokens: MAX_TOKENS }
				}))
			);
			expect(live.design.template.guards).toEqual(base.design.template.guards);
		}
	});

	it('has unique ids, one design recorded twice, and each cassette in its own folder', () => {
		const ids = LIVE.map(liveIdOf);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toContain('lending-stack-live');
		expect(ids).toContain('lending-stack-live-b');
	});
});

describe('the replay check', () => {
	const effect = (delta: number, n = 50) => ({
		metricId: 'agreement',
		factor: { axis: 'guard', baseline: 'none', treatment: 'policy-cards' },
		tier: 'live',
		baseline: { value: 0.6, n, interval: [0.4, 0.8] },
		treatment: { value: 0.6 + delta, n, interval: [0.4, 0.8] },
		delta,
		interval: [-0.2, 0.2],
		underpowered: false
	});
	const result = (effects: unknown[], verdict = 'inconclusive') => ({ verdict, effects });

	it('is silent when the replay reproduces every number, whatever order and whatever ids', () => {
		const a = result([effect(0.1), effect(0.2)]);
		const b = result([effect(0.2), effect(0.1)]);
		expect(compareReplay(a, b)).toEqual([]);
	});

	it('names a verdict that moved, an effect that is missing and a number that differs', () => {
		const committed = result([effect(0.1)]);
		expect(compareReplay(committed, result([effect(0.1)], 'supported'))[0]).toContain('verdict');
		expect(compareReplay(committed, result([]))[0]).toContain('effects');
		const moved = compareReplay(committed, result([effect(0.1000001)]));
		expect(moved.some((p) => p.startsWith('not reproduced'))).toBe(true);
		expect(effectKey(effect(0.1))).not.toBe(effectKey(effect(0.2)));
	});

	it('holds a cell-scoped recording to its path: a cell off it, an unasked call or a divergence is named, a match is silent', () => {
		const report = (cells: unknown[]) => ({ campaignId: 'c', cells });
		const cell = (extra: Record<string, unknown>) => ({
			item: { id: 'loan-1' },
			seed: 1,
			ordinal: 0,
			...extra
		});
		expect(replayProblems([report([cell({ replay: { status: 'match', unused: 0 } })])])).toEqual(
			[]
		);
		// A version 1 cassette's cells carry no replay verdict: nothing to hold them to.
		expect(replayProblems([report([cell({})])])).toEqual([]);
		const off = replayProblems([
			report([
				cell({ replay: { status: 'mismatch', unused: 2 } }),
				cell({ error: 'replay-diverged: cell x, call #3 — asked prompt aaaa…' }),
				cell({ replay: { status: 'diverged', unused: 0, divergedAt: 4 } })
			])
		]);
		expect(off).toHaveLength(3);
		expect(off[0]).toContain('replay mismatch, 2 recorded calls unasked');
		expect(off[1]).toContain('replay-diverged');
		expect(off[2]).toContain('diverged at call #4');
	});
});

describe('the live column', () => {
	const entry = (digest: string, occurrence: number, text: string, finishReason = 'tool_call') => ({
		promptDigest: digest,
		occurrence,
		model: 'm',
		response: { text, toolCall: { name: 'decide', arguments: {} }, finishReason },
		latencyMs: 1
	});

	it('counts identical answers to the same prompt, and the prompts only one recording was asked', async () => {
		const { cassetteAgreement, caseConcordance, finishReasons, baselineSide } =
			await import('../../../../scripts/live-column.mjs');
		const a = { entries: [entry('x', 0, 'yes'), entry('y', 0, 'no'), entry('z', 0, 'a')] };
		const b = { entries: [entry('x', 0, 'yes'), entry('y', 0, 'maybe'), entry('w', 0, 'q')] };
		expect(cassetteAgreement(a, b)).toEqual({
			shared: 2,
			same: 1,
			sameCall: 2,
			onlyA: 1,
			onlyB: 1
		});
		// The same cases decided the same way, matched by campaign and case.
		const row = (campaign: string, item: string, agree: string) => ({
			campaign,
			item,
			verdicts: { rule: agree }
		});
		expect(
			caseConcordance(
				[row('c', '1', 'pass'), row('c', '2', 'fail'), row('c', '3', 'pass')],
				[row('c', '1', 'pass'), row('c', '2', 'pass'), row('d', '3', 'pass')]
			)
		).toEqual({ compared: 2, same: 1 });
		// The same digest asked a second time is a different prompt occurrence.
		expect(cassetteAgreement({ entries: [entry('x', 1, 'yes')] }, b).shared).toBe(0);
		expect(finishReasons({ entries: [entry('x', 0, 'a'), entry('y', 0, 'b', 'length')] })).toEqual({
			tool_call: 1,
			length: 1
		});
		const effect = (axis: string) => ({
			metricId: 'agreement',
			factor: { axis },
			baseline: { value: axis === 'guard' ? 0.5 : 0.9, n: 10, interval: [0.2, 0.8] }
		});
		// The guard axis is the reference configuration with no control; the first effect otherwise.
		expect(
			baselineSide({ effects: [effect('executors'), effect('guard')] }, 'agreement')?.value
		).toBe(0.5);
		expect(baselineSide({ effects: [effect('executors')] }, 'agreement')?.value).toBe(0.9);
		expect(baselineSide({ effects: [] }, 'agreement')).toBeUndefined();
	});
});
