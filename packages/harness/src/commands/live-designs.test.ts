import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareReplay, effectKey, replayProblems } from '../../../../scripts/live-check.mjs';
import { SUITES, suiteFrom, trialsOf } from '../../../../scripts/live-suite.mjs';
import {
	LIVE,
	OVERSIGHT,
	designsOf,
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
			// A design over scenarios (plan 113 §12, item 10) has no book to resize: its scenarios are the base's and its one seed is the model's to vary.
			if (entry.scenarios) {
				expect(live.design.template.scenarios).toEqual(base.design.template.scenarios);
				expect(live.design.seeds).toEqual([1]);
			} else {
				expect(live.design.template.source.population.size).toBe(entry.size);
			}
			expect(live.design.template.budget.maxLiveCells).toBeGreaterThan(0);
			// Performed more than once: the design says so, so its replay runs as many performances as were recorded (113 §12).
			expect(live.design.trials).toBe((entry.trials ?? 1) > 1 ? entry.trials : undefined);
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

	it('has unique ids, no design recorded as two (trials measure the variance now), and each design’s trials planned (plan 113 §12)', () => {
		const ids = LIVE.map(liveIdOf);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toContain('lending-stack-live');
		expect(ids).not.toContain('lending-stack-live-b');
		// The designs where a second performance can change a conclusion are performed twice; the servicing designs, at a ceiling, once.
		const trialsOf = (id: string) => LIVE.find((entry) => liveIdOf(entry) === id)?.trials ?? 1;
		expect(trialsOf('lending-stack-live')).toBe(2);
		expect(trialsOf('controls-live')).toBe(2);
		expect(trialsOf('servicing-stack-live')).toBe(1);
		expect(trialsOf('servicing-stack-live-seat')).toBe(1);
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

	it('reads a design performed twice by its reference configuration, over items (plan 113 §12)', async () => {
		const { reliabilityRows } = await import('../../../../scripts/live-column.mjs');
		const stat = (value: number) => ({ value, interval: [0, 1] as [number, number], method: 'm' });
		const metrics = [
			{
				metricId: 'agreement',
				pass1: stat(0.9),
				passAtK: stat(1),
				passHatK: stat(0.8),
				consistency: stat(0.85)
			}
		];
		const campaign = (campaignId: string) => ({ campaignId, k: 2, items: 50, metrics });
		const rows = reliabilityRows(
			{
				reliability: [
					campaign('x--executors=rules-only--guard=none'),
					campaign('x--executors=bot-everywhere--guard=none'),
					campaign('x--executors=bot-everywhere--guard=policy-cards')
				]
			},
			'agreement'
		);
		// No guard, and the bot everywhere where the design has executors; nothing for a metric the design does not have.
		expect(rows.map((row) => row.campaignId)).toEqual(['x--executors=bot-everywhere--guard=none']);
		expect(reliabilityRows({ reliability: [campaign('y--guard=none')] }, 'nothing')).toEqual([]);
		expect(reliabilityRows({}, 'agreement')).toEqual([]);
	});
});

describe('the 35B suite (113 §12)', () => {
	const quick = SUITES.quick!;
	const read = (path: string) =>
		JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../..', path), 'utf8'));

	it('names a suite by flag or environment, defaulting to the 122B, and never writes over the other', () => {
		expect(suiteFrom([], {}).suite.id).toBe('giant');
		expect(suiteFrom(['--suite', 'quick', 'lending-stack-live'], {})).toMatchObject({
			suite: { id: 'quick' },
			rest: ['lending-stack-live']
		});
		expect(suiteFrom([], { LIVE_SUITE: 'quick' }).suite.id).toBe('quick');
		expect(() => suiteFrom(['--suite', 'nope'], {})).toThrow(/no live suite/);
		const giant = SUITES.giant!;
		for (const key of ['experimentsDir', 'evidenceDir', 'recordingsDir', 'workDir'] as const)
			expect(quick[key]).not.toBe(giant[key]);
		expect(quick).toMatchObject({
			cartridge: 'dgx-spark/quick-qwen',
			model: 'Qwen3.6-35B-A3B-NVFP4',
			pattern: 'fast-pair'
		});
	});

	it('is every design of the 122B suite with the 35B in the brain’s seat, each performed twice, committed as generated', () => {
		for (const entry of LIVE) {
			const id = liveIdOf(entry);
			const generated = liveDesign(entry, undefined, quick);
			expect(read(`${quick.experimentsDir}/${id}.json`)).toEqual(generated);
			expect(generated.design.template.brains).toEqual([
				{
					id: 'live',
					tier: 'live',
					cartridgeId: quick.cartridge,
					cassette: `${quick.evidenceDir}/${id}/${id}.provider-cassette.json`
				}
			]);
			expect(generated.design.trials).toBe(2);
			expect(trialsOf(entry, quick)).toBe(2);
			if (entry.seat)
				expect(generated.design.template.counterpart.cartridgeId).toBe(quick.cartridge);
			// Everything but the model, the cassette, the title and the trials is the 122B design's, so the two suites compare.
			const giant = liveDesign(entry);
			expect(generated.design.template.builds).toEqual(giant.design.template.builds);
			expect(generated.design.factors).toEqual(giant.design.factors);
			expect(generated.design.template.source).toEqual(giant.design.template.source);
		}
	});
});

describe('the comparison of the two suites (113 §12)', () => {
	it('counts the bot cells a model’s habits lost, and lays two suites side by side', async () => {
		const { lostShare, renderComparison } = await import('../../../../scripts/live-compare.mjs');
		expect(
			lostShare([
				{ campaign: 'x--executors=rules-only--guard=none', outcome: 'SUCCESS' },
				{ campaign: 'x--executors=bot-everywhere--guard=none', outcome: 'SUCCESS' },
				{ campaign: 'x--executors=bot-everywhere--guard=none', outcome: 'ERROR' }
			])
		).toBe(0.5);
		expect(lostShare([])).toBe(0);
		const row = (agreement: number, lost: number) => ({
			id: 'lending-stack-live',
			what: 'lending decision matches the rule',
			side: { value: agreement, interval: [agreement - 0.05, 1] as [number, number] },
			passHatK: { value: agreement },
			lost,
			wallMinutes: 66,
			tokens: 12391
		});
		const text = renderComparison([{ giant: row(1, 0.03), quick: row(0.9, 0.1) }]);
		expect(text).toContain(
			'| `lending-stack-live` | lending decision matches the rule | 100% (95%–100%) | 90% (85%–100%) |'
		);
		expect(text).toContain('100% / 90%');
		expect(text).toContain('3% / 10%');
	});
});

/**
 * **The oversight suite** (WP198, `114-DECISIONS-UNDER-PRESSURE-PLAN.md`): the lending and complaints journeys with the reviewer model of
 * a person who says no at the decisions, over the levels where a person sits, on the 122B, in folders of its own.
 */
describe('the oversight suite', () => {
	const suite = SUITES.oversight!;

	it('is a suite of its own with the 122B, and the first two suites do not list its designs', () => {
		expect(suite.model).toBe(SUITES.giant!.model);
		expect(designsOf(suite)).toBe(OVERSIGHT);
		expect(designsOf(SUITES.giant!)).toBe(LIVE);
		expect(designsOf(SUITES.quick!)).toBe(LIVE);
		expect(LIVE.some((entry) => OVERSIGHT.includes(entry))).toBe(false);
	});

	it('names a person who refuses, asks and is late at every build, and only the levels with a person', () => {
		for (const entry of OVERSIGHT) {
			const design = liveDesign(entry, undefined, suite);
			expect(design.id).toBe(liveIdOf(entry));
			for (const build of design.design.template.builds)
				expect(build.overrides.reviewer).toBe('fs-bank/reviewer/person-at-approval');
			const executors = design.design.factors.find((f: { axis: string }) => f.axis === 'executors');
			expect(executors.levels).toEqual(entry.executors);
			expect(executors.levels).not.toContain('rules-only');
			expect(design.design.baseline.executors).toBe(
				entry.baselineExecutors ?? entry.executors!.at(-1)
			);
			expect(design.design.trials).toBe(2);
			expect(design.design.template.brains[0].cassette).toBe(
				`docs/evidence/live-oversight/${liveIdOf(entry)}/${liveIdOf(entry)}.provider-cassette.json`
			);
		}
	});
});
