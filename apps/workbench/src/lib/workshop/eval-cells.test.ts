import { describe, expect, it } from 'vitest';
import type { AgentSpec, EngineEvent } from '@craftabot/core';
import type { EvalCell } from '@craftabot/evals';
import { SUCCESS_RAMP, rampStep, recordForCell, summaryAt } from './eval-cells.js';

/**
 * The grid's colour ramp and the record assembly behind its drill-down.
 *
 * The ramp has one property that is easy to lose and expensive to lose: **every
 * step must have a label colour that can be read on it**. `17-…` §4.4 puts the
 * value in the cell, so a step where neither ink nor cream clears 4.5:1 is a
 * row of numbers nobody can read — which is what the first attempt produced.
 */

const luminance = (hex: string): number => {
	const value = Number.parseInt(hex.slice(1), 16);
	const channel = (raw: number) => {
		const c = raw / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return (
		0.2126 * channel((value >> 16) & 255) +
		0.7152 * channel((value >> 8) & 255) +
		0.0722 * channel(value & 255)
	);
};
const ratio = (a: string, b: string) => {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
};

/** The Workshop's ink and cream (`tokens.css`, `[data-mode='workshop']`). */
const INK = '#23211e';
const CREAM = '#ecebe6';

describe('the success ramp', () => {
	it('is sequential — strictly light to dark', () => {
		// The check that actually applies to a magnitude ramp. (The categorical
		// CVD checks do not: there are no categories here, only more and less.)
		const lums = SUCCESS_RAMP.map((step) => luminance(step.fill));
		for (let i = 1; i < lums.length; i += 1) {
			expect(lums[i]!, `step ${i}`).toBeLessThan(lums[i - 1]!);
		}
	});

	it('gives every step a label that can be read on it', () => {
		for (const step of SUCCESS_RAMP) {
			const label = step.ink ? INK : CREAM;
			expect(ratio(label, step.fill), step.fill).toBeGreaterThanOrEqual(4.5);
		}
	});

	it('uses no brick colour', () => {
		// `04-…` §2.2 is law in both modes: green is Memory, and a green
		// success-rate grid would put the Memory colour on a number that has
		// nothing to do with memory. Teal is the designated non-brick accent.
		const bricks = ['#2456a6', '#4e8a3c', '#6c4f9e', '#5484bb', '#c93a2e', '#e9b62f'];
		for (const step of SUCCESS_RAMP) {
			expect(bricks).not.toContain(step.fill.toLowerCase());
		}
	});

	it('darkens as the rate rises, and reserves the darkest for a clean sweep', () => {
		expect(luminance(rampStep(0).fill)).toBeGreaterThan(luminance(rampStep(0.5).fill));
		expect(luminance(rampStep(0.5).fill)).toBeGreaterThan(luminance(rampStep(1).fill));
		// 100% is the answer people look for first and must not share a colour
		// with 96%.
		expect(rampStep(1)).not.toEqual(rampStep(0.96));
	});

	it('stays in range at both ends', () => {
		expect(SUCCESS_RAMP).toContain(rampStep(0));
		expect(SUCCESS_RAMP).toContain(rampStep(1));
	});
});

describe('finding a square', () => {
	const summaries = [
		{ goalCardId: 'a', brainId: 'x' },
		{ goalCardId: 'b', brainId: 'y' }
	] as never as Parameters<typeof summaryAt>[0];

	it('matches on both axes, not either', () => {
		expect(summaryAt(summaries, 'a', 'y')).toBeUndefined();
		expect(summaryAt(summaries, 'a', 'x')).toBeDefined();
	});
});

describe('a cell as a run record', () => {
	const spec = { id: '11111111-1111-4111-8111-111111111111' } as AgentSpec;
	const started: EngineEvent = {
		id: '00000000-0000-4000-8000-000000000001',
		runId: '33333333-3333-4333-8333-333333333333',
		agentId: '11111111-1111-4111-8111-111111111111',
		tick: 0,
		timestamp: '2026-08-15T10:00:00.000Z',
		type: 'run.started',
		payload: {
			mode: 'step',
			budgets: { maxTicks: 30, maxTokens: 8000, requestTimeoutMs: 30_000 },
			providerId: 'mock',
			wireModel: 'mock-1',
			cartridgeId: 'test/mock-brain'
		}
	} as EngineEvent;

	const cell: EvalCell = {
		goalCardId: 'starter/say-hello',
		brainId: 'scripted-noisy',
		tier: 'scripted-noisy',
		configId: 'default',
		seed: 3,
		runId: '33333333-3333-4333-8333-333333333333',
		metrics: {
			outcome: 'SUCCESS',
			ticksUsed: 5,
			tokensIn: 120,
			tokensOut: 30,
			loop: { longestStreak: 1, repeatedFailures: 0 },
			wastedTickRatio: 0.2,
			namingMisses: 0,
			namingAmbiguities: 0,
			guardrailTrips: {},
			approvalsRequested: 0,
			approvalsDenied: 0
		}
	};

	it('takes its budgets and model from run.started, not from assumptions', () => {
		// E8 put them in that event precisely so a record could be honest about
		// what a run was actually held to.
		const record = recordForCell(cell, [started], spec);
		expect(record?.budgets.maxTicks).toBe(30);
		expect(record?.wireModel).toBe('mock-1');
		expect(record?.mode).toBe('step');
	});

	it('names the run after the cell, so its origin is obvious in the browser', () => {
		expect(recordForCell(cell, [started], spec)?.agentName).toBe(
			'eval · say-hello · scripted-noisy · seed 3'
		);
	});

	it('arrives unpinned — pinning is something a person does', () => {
		expect(recordForCell(cell, [started], spec)?.pinned).toBe(false);
	});

	it('has no end until the run had one', () => {
		expect(recordForCell(cell, [started], spec)?.finishedAt).toBeUndefined();

		const finished = { ...started, type: 'run.finished', timestamp: '2026-08-15T10:00:09.000Z' };
		expect(recordForCell(cell, [started, finished as EngineEvent], spec)?.finishedAt).toBe(
			'2026-08-15T10:00:09.000Z'
		);
	});

	it('declines a cell that never ran', () => {
		// A cell that threw has no trace to open, and inventing a record for it
		// would put a run in the browser that never happened.
		expect(recordForCell({ ...cell, runId: undefined }, [], spec)).toBeUndefined();
		expect(recordForCell(cell, [], spec)).toBeUndefined();
	});
});
