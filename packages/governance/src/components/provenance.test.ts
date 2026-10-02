import type { ComponentDeps, EngineEvent, PolicyCard } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { turnsWithoutProgress } from '../guardrails/no-progress.js';
import { compilePolicyCard } from '../policy-compiler.js';
import { action, context } from '../test-context.js';
import { memoryProvenanceComponent, noProgressComponent } from './provenance.js';

/**
 * WP141 (`110-CONTROL-SUITE-PLAN.md` §10): the no-progress detector counts
 * the turns since the world last moved, whatever was tried; memory provenance
 * refuses a think over a notebook line written under an untrusted context,
 * and the `memory-is-untrusted` leaf reads the same tag.
 */
let sequence = 0;
const event = (type: string, payload: unknown, tick: number) =>
	({
		id: `e${sequence++}`,
		runId: 'r',
		tick,
		timestamp: '2026-10-02T09:00:00.000Z',
		type,
		payload
	}) as EngineEvent;

/** A turn: its call, whether it worked, and the world after it (an unchanged world when absent). */
type Turn = { name: string; ok?: boolean; world?: Record<string, unknown> };

function history(start: Record<string, unknown>, ...turns: Turn[]): EngineEvent[] {
	const events: EngineEvent[] = [event('world.changed', { state: start }, 0)];
	let world = start;
	turns.forEach((turn, index) => {
		const tick = index + 1;
		events.push(
			event(
				'decision',
				{ thought: '', call: { kind: 'action', name: turn.name, arguments: {} } },
				tick
			)
		);
		const ok = turn.ok ?? true;
		events.push(
			event(
				'action.performed',
				{ name: turn.name, arguments: {}, result: { ok, narration: '' } },
				tick
			)
		);
		if (ok) {
			world = turn.world ?? world;
			events.push(event('world.changed', { state: world }, tick));
		}
	});
	return events;
}

/** The proposal being judged: a `decision` with no fate yet. */
const proposing = (events: EngineEvent[], name: string) => [
	...events,
	event('decision', { thought: '', call: { kind: 'action', name, arguments: {} } }, 99)
];

const deps = (progress: string[] = []): ComponentDeps => ({
	getPolicyCard: () => undefined,
	getGuardrailService: () => undefined,
	getEvaluator: () => undefined,
	getAction: (name) => (progress.includes(name) ? ({ progress: true } as never) : undefined)
});

describe('the no-progress detector (WP141)', () => {
	it('counts turns that change nothing, whichever call made them — the loop the loop-breaker cannot see', () => {
		const events = history(
			{ file: 'open' },
			{ name: 'look-up-a' },
			{ name: 'look-up-b' },
			{ name: 'look-up-c', ok: false },
			{ name: 'look-up-a' }
		);
		expect(turnsWithoutProgress(proposing(events, 'look-up-b'))).toBe(4);
	});

	it('resets when the world moves, or when the world declares the call progress', () => {
		const moved = history(
			{ file: 'open' },
			{ name: 'look-up-a' },
			{ name: 'verify', world: { file: 'open', verified: true } },
			{ name: 'look-up-b' }
		);
		expect(turnsWithoutProgress(proposing(moved, 'x'))).toBe(1);
		const declared = history({ file: 'open' }, { name: 'look-up-a' }, { name: 'walk' });
		expect(turnsWithoutProgress(proposing(declared, 'x'), (name) => name === 'walk')).toBe(0);
	});

	it('stops the run at its limit, and only then', () => {
		const [guardrail] = noProgressComponent.compile({ turns: 3 }, deps(), { kind: 'pre-act' });
		const two = history({ a: 1 }, { name: 'x' }, { name: 'y' });
		expect(
			guardrail!.check(
				context({ hook: 'pre-act', proposed: action('z'), history: proposing(two, 'z') })
			)
		).toMatchObject({ allow: true });
		const three = history({ a: 1 }, { name: 'x' }, { name: 'y' }, { name: 'x' });
		expect(
			guardrail!.check(
				context({ hook: 'pre-act', proposed: action('z'), history: proposing(three, 'z') })
			)
		).toMatchObject({ allow: false, disposition: 'stop-run' });
	});

	it('takes the world’s progress declaration through its deps', () => {
		const [guardrail] = noProgressComponent.compile({ turns: 2 }, deps(['walk']), {
			kind: 'pre-act'
		});
		const walking = history({ a: 1 }, { name: 'walk' }, { name: 'walk' });
		expect(
			guardrail!.check(
				context({ hook: 'pre-act', proposed: action('walk'), history: proposing(walking, 'walk') })
			)
		).toMatchObject({ allow: true });
	});
});

describe('memory provenance (WP141)', () => {
	const written = (source?: 'untrusted') =>
		event(
			'memory.updated',
			{ windowSize: 5, entries: 2, notebookUpdated: true, ...(source ? { source } : {}) },
			2
		);
	const unwritten = event(
		'memory.updated',
		{ windowSize: 5, entries: 1, notebookUpdated: false, source: 'untrusted' },
		1
	);

	it('lets a think through over a notebook written under a clean context', () => {
		const [guardrail] = memoryProvenanceComponent.compile({}, deps(), { kind: 'pre-think' });
		expect(guardrail!.check(context({ history: [written(), unwritten] }))).toEqual({ allow: true });
	});

	it('stops a think over a line written under an untrusted context, or notes it', () => {
		const [stop] = memoryProvenanceComponent.compile({}, deps(), { kind: 'pre-think' });
		expect(stop!.check(context({ history: [written('untrusted')] }))).toMatchObject({
			allow: false,
			disposition: 'stop-run'
		});
		const [note] = memoryProvenanceComponent.compile({ verdict: 'annotate' }, deps(), {
			kind: 'pre-think'
		});
		expect(note!.check(context({ history: [written('untrusted')] }))).toMatchObject({
			allow: true,
			verdictKind: 'annotate',
			finding: { category: 'untrusted-content' }
		});
	});

	it('is a leaf a card can read', () => {
		const card = {
			id: 'test/policy/no-poisoned-memory',
			title: 'No thinking over poisoned memory',
			description: 'Stops the run when the notebook holds an untrusted line.',
			schemaVersion: 1,
			rules: [
				{
					hook: 'pre-think',
					when: { kind: 'memory-is-untrusted' },
					then: 'stop-run',
					reason: 'The notebook holds a line written after reading untrusted content.'
				}
			]
		} as PolicyCard;
		const [rule] = compilePolicyCard(card);
		expect(rule!.check(context({ history: [written()] }))).toMatchObject({ allow: true });
		expect(rule!.check(context({ history: [written('untrusted')] }))).toMatchObject({
			allow: false
		});
	});
});
