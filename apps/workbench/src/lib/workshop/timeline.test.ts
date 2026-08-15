import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '@craftabot/core';
import { buildTimeline, isFailure, lanesPresent } from './timeline.js';

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

const acted = (ok: boolean, tick = 1, name = 'move') =>
	event('action.performed', { name, arguments: {}, result: { ok, narration: '' } }, tick);
const thought = (input: number, output: number, tick = 1) =>
	event(
		'think.completed',
		{ response: { usage: { inputTokens: input, outputTokens: output } } },
		tick
	);

describe('grouping', () => {
	it('groups rows by the turn they happened in', () => {
		const ticks = buildTimeline([
			event('tick.started', {}, 1),
			acted(true, 1),
			event('tick.started', {}, 2),
			acted(true, 2)
		]);
		expect(ticks.map((t) => t.tick)).toEqual([1, 2]);
		expect(ticks[0]?.rows).toHaveLength(2);
	});

	it('never re-orders — stored order is the order things happened', () => {
		// A forensic timeline that sorted its own rows would answer a different
		// question from the one being asked.
		const rows = buildTimeline([acted(true), event('sense', { observation: {} }), thought(1, 1)])[0]
			?.rows;
		expect(rows?.map((row) => row.event.type)).toEqual([
			'action.performed',
			'sense',
			'think.completed'
		]);
	});

	it('totals the tokens each turn cost, for the gutter', () => {
		const ticks = buildTimeline([thought(100, 20, 1), thought(50, 10, 1), thought(7, 3, 2)]);
		expect(ticks[0]).toMatchObject({ tokensIn: 150, tokensOut: 30 });
		expect(ticks[1]).toMatchObject({ tokensIn: 7, tokensOut: 3 });
	});

	it('keeps the index into the unfiltered list, so a row has a stable identity', () => {
		// Selection has to survive a filter change: the row you were reading must
		// not become a different row because you ticked a box.
		const events = [acted(true), acted(false), acted(true)];
		const filtered = buildTimeline(events, { onlyFailures: true });
		expect(filtered[0]?.rows[0]?.index).toBe(1);
	});
});

describe('filters', () => {
	const events = [
		event('tick.started', {}, 1),
		acted(false, 1),
		event('guardrail.tripped', { guardrailId: 'starter/step-budget', reason: 'no' }, 1),
		thought(10, 2, 1)
	];

	it('treats no lanes as no filter, not as nothing', () => {
		// The difference between "I have not chosen" and "I have chosen none" is
		// the difference between a full table and an empty one.
		expect(buildTimeline(events, { lanes: [] })[0]?.rows).toHaveLength(4);
	});

	it('shows only the lanes asked for', () => {
		const rows = buildTimeline(events, { lanes: ['guardrail'] })[0]?.rows;
		expect(rows?.map((r) => r.event.type)).toEqual(['guardrail.tripped']);
	});

	it('finds trouble that is not an error', () => {
		// A refused action and a tripped guardrail are both what a practitioner
		// scanning for trouble is looking for, and neither is an `error`.
		const rows = buildTimeline(events, { onlyFailures: true })[0]?.rows;
		expect(rows?.map((r) => r.event.type)).toEqual(['action.performed', 'guardrail.tripped']);
	});

	it('searches inside the payload, not only the labels', () => {
		// "Where does this id appear" is where an incident starts, and it has no
		// answer if the search reads only row titles.
		const rows = buildTimeline(events, { text: 'step-budget' })[0]?.rows;
		expect(rows).toHaveLength(1);
	});

	it('drops a turn entirely when nothing in it matches', () => {
		const across = [acted(false, 1), acted(true, 2)];
		expect(buildTimeline(across, { onlyFailures: true }).map((t) => t.tick)).toEqual([1]);
	});
});

describe('what counts as a failure', () => {
	it.each([
		['a refused action', acted(false), true],
		['an accepted action', acted(true), false],
		['a tripped guardrail', event('guardrail.tripped', { guardrailId: 'g', reason: 'r' }), true],
		['a denied approval', event('approval.resolved', { approved: false }), true],
		['an allowed approval', event('approval.resolved', { approved: true }), false],
		['a run that did not succeed', event('run.finished', { outcome: 'OUT_OF_STEPS' }), true],
		['a run that did', event('run.finished', { outcome: 'SUCCESS' }), false]
	])('%s', (_name, e, expected) => {
		expect(isFailure(e as EngineEvent)).toBe(expected);
	});
});

describe('lane chips', () => {
	it('offers only the lanes this run actually has', () => {
		// A chip that filters to nothing is a chip that wastes a click.
		expect(lanesPresent([acted(true), thought(1, 1)])).toEqual(['think', 'action']);
	});
});
