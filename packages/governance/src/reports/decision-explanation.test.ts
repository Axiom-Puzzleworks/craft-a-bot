import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EngineEvent } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { decisionExplanation, explanationsForTicks, reasonsUsed } from './decision-explanation.js';

let seq = 0;
function event<T extends EngineEvent['type']>(type: T, payload: unknown, tick = 1): EngineEvent {
	seq += 1;
	return {
		id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
		runId: '11111111-1111-4111-8111-111111111111',
		tick,
		timestamp: '2026-09-06T09:00:00.000Z',
		type,
		payload
	} as EngineEvent;
}

const result = { ok: true, narration: 'done' };

describe('reasonsUsed (WP63)', () => {
	it('folds what a decision had in hand: the actions before it, the records revealed by then, the observation it saw', () => {
		const events = [
			event('sense', {
				channels: ['application'],
				observation: { channels: [], text: 'An application.' }
			}),
			event('action.performed', { name: 'desk/verify-identity', arguments: {}, result }),
			event('world.changed', { state: { records: [{ id: 'application' }, { id: 'customer' }] } }),
			event(
				'sense',
				{ channels: ['bureau'], observation: { channels: [], text: 'Score band fair.' } },
				2
			),
			event(
				'tool.executed',
				{ name: 'connector_bureau_file', arguments: { id: 1 }, result: 'ok' },
				2
			),
			event('action.performed', { name: 'desk/assess-affordability', arguments: {}, result }, 2),
			event(
				'world.changed',
				{ state: { records: [{ id: 'application' }, { id: 'customer' }, { id: 'bureau' }] } },
				2
			),
			event(
				'decision',
				{ thought: 'Decline.', call: { kind: 'action', name: 'desk/decide', arguments: {} } },
				3
			),
			event(
				'action.performed',
				{ name: 'desk/decide', arguments: { outcome: 'decline' }, result },
				3
			),
			event('world.changed', { state: { records: [{ id: 'worksheet' }] } }, 3)
		];
		const decision = events[7]!;
		expect(reasonsUsed(events, decision.id)).toEqual({
			found: true,
			actions: [
				{ name: 'desk/verify-identity', arguments: {} },
				{ name: 'connector_bureau_file', arguments: { id: 1 } },
				{ name: 'desk/assess-affordability', arguments: {} }
			],
			records: ['application', 'customer', 'bureau'],
			text: 'Score band fair.'
		});
	});

	it('is empty and not found for an id no event carries, and empty for a grid world with no records', () => {
		const events = [
			event('world.changed', {
				state: { width: 4, height: 4, bot: { position: { x: 0, y: 0 } }, items: [] }
			}),
			event('action.performed', { name: 'move', arguments: { direction: 'east' }, result })
		];
		expect(reasonsUsed(events, 'nope')).toEqual({
			found: false,
			actions: [],
			records: [],
			text: ''
		});
		expect(reasonsUsed(events, events[1]!.id)).toEqual({
			found: true,
			actions: [],
			records: [],
			text: ''
		});
	});
});

/**
 * `decisionExplanation` (WP66, `54-…` §4.4, §11 item 4): one decision with
 * everything around it, `related` naming its causes and effects; a check,
 * an approval and a refusal each read as they were; and a snapshot over
 * every decision of every golden trace in the repo.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const GOLDENS = [
	'packages/packs/starter/src/fixtures/trace.say-hello.v1.json',
	'packages/packs/starter/src/fixtures/trace.confused-deputy.v1.json',
	'packages/desk/src/fixtures/trace.desk-minimal.v1.json',
	'packages/desk/src/fixtures/trace.desk-counterpart-offline.v1.json'
];
const golden = (rel: string): EngineEvent[] =>
	JSON.parse(readFileSync(join(REPO, rel), 'utf8')) as EngineEvent[];

describe('decisionExplanation (WP66)', () => {
	it('explains a checked, approved, performed decision and names every related row', () => {
		const events = [
			event('tick.started', {}, 2),
			event(
				'sense',
				{ channels: ['look'], observation: { channels: ['look'], text: 'A chest.' } },
				2
			),
			event(
				'prompt.composed',
				{
					messages: [
						{ role: 'system', content: 'You are a bot.' },
						{ role: 'user', content: 'A chest.' }
					],
					estimatedTokens: 9
				},
				2
			),
			event(
				'think.completed',
				{
					response: {
						text: 'Open it.',
						toolCall: { name: 'open', arguments: {} },
						usage: { inputTokens: 9, outputTokens: 2 }
					},
					durationMs: 1
				},
				2
			),
			event(
				'decision',
				{
					thought: 'Open it.',
					call: { kind: 'action', name: 'open', arguments: {} },
					source: 'brain'
				},
				2
			),
			event(
				'guardrail.checked',
				{
					guardrailId: 'safety/step-budget',
					hook: 'pre-act',
					verdict: { allow: true, note: '3 left' }
				},
				2
			),
			event(
				'guardrail.checked',
				{
					guardrailId: 'safety/approval-mode',
					hook: 'pre-act',
					verdict: { pause: true, reason: 'ask first' }
				},
				2
			),
			event(
				'approval.requested',
				{ proposed: { kind: 'action', name: 'open', arguments: {} }, reason: 'ask first' },
				2
			),
			event('approval.resolved', { approved: true }, 2),
			event(
				'action.performed',
				{
					name: 'open',
					arguments: {},
					result: {
						ok: true,
						narration: 'It opens.',
						stateDiff: [{ path: 'chest', from: 'shut', to: 'open' }]
					}
				},
				2
			),
			event('world.changed', { state: { chest: 'open' } }, 2),
			event('memory.updated', { windowSize: 10, entries: 2, notebookUpdated: false }, 2),
			event('tick.completed', {}, 2)
		];
		const decision = events[4]!;
		const explanation = decisionExplanation(events, decision.id, {
			callsAvailable: ['open', 'look']
		});
		expect(explanation).toMatchObject({
			version: 1,
			tick: 2,
			source: 'brain',
			observation: { channels: ['look'], text: 'A chest.' },
			prompt: {
				sections: [
					{ role: 'system', chars: 14 },
					{ role: 'user', chars: 8 }
				],
				estimatedTokens: 9
			},
			callsAvailable: ['open', 'look'],
			decision: { thought: 'Open it.', call: { kind: 'action', name: 'open', arguments: {} } },
			checks: [
				{ guardrailId: 'safety/step-budget', hook: 'pre-act', verdict: 'allow' },
				{
					guardrailId: 'safety/approval-mode',
					hook: 'pre-act',
					verdict: 'pause',
					reason: 'ask first'
				}
			],
			approval: { requested: true, approved: true, reason: 'ask first' },
			result: { kind: 'action', name: 'open', ok: true, narration: 'It opens.' }
		});
		expect(explanation?.related).toEqual(events.slice(1, 11).map((row) => row.id));
		expect(explanation?.reasonsUsed.text).toBe('A chest.');
		expect(decisionExplanation(events, 'nope')).toBeUndefined();
		expect(decisionExplanation(events, events[1]!.id)).toBeUndefined();
	});

	it('reads a block, a stop and a person’s no; a reflex has no prompt; a tool call is its result', () => {
		const blocked = [
			event('sense', { channels: [], observation: { channels: [], text: 'x' } }, 3),
			event(
				'decision',
				{
					thought: 'Fire.',
					call: { kind: 'action', name: 'fire', arguments: {} },
					source: 'reflex'
				},
				3
			),
			event(
				'guardrail.checked',
				{
					guardrailId: 'policy/no-fire',
					hook: 'pre-act',
					verdict: { allow: false, reason: 'no fire', disposition: 'block-action' },
					policyCardId: 'x/policy/no-fire'
				},
				3
			),
			event(
				'guardrail.tripped',
				{
					guardrailId: 'policy/no-fire',
					hook: 'pre-act',
					reason: 'no fire',
					disposition: 'block-action',
					policyCardId: 'x/policy/no-fire'
				},
				3
			),
			event('tick.completed', {}, 3)
		];
		expect(decisionExplanation(blocked, blocked[1]!.id)).toMatchObject({
			source: 'reflex',
			prompt: undefined,
			checks: [{ verdict: 'block', reason: 'no fire', policyCardId: 'x/policy/no-fire' }],
			result: undefined,
			related: [blocked[0]!.id, blocked[1]!.id, blocked[2]!.id, blocked[3]!.id]
		});
		const stopped = [
			event(
				'decision',
				{
					thought: 'Go.',
					call: { kind: 'tool', name: 'echo', arguments: { a: 1 } },
					source: 'brain'
				},
				4
			),
			event(
				'guardrail.checked',
				{
					guardrailId: 'safety/token-budget',
					hook: 'pre-act',
					verdict: { allow: false, reason: 'spent', disposition: 'stop-run' }
				},
				4
			),
			event(
				'tool.executed',
				{ name: 'echo', arguments: { a: 1 }, result: 'echo: 1', durationMs: 2 },
				4
			),
			event('tick.completed', {}, 4)
		];
		expect(decisionExplanation(stopped, stopped[0]!.id)).toMatchObject({
			checks: [{ verdict: 'stop', reason: 'spent' }],
			result: { kind: 'tool', name: 'echo', ok: true, output: 'echo: 1' }
		});
		const denied = [
			event(
				'decision',
				{ thought: 'Go.', call: { kind: 'action', name: 'open', arguments: {} }, source: 'brain' },
				5
			),
			event(
				'approval.requested',
				{ proposed: { kind: 'action', name: 'open', arguments: {} }, reason: 'ask' },
				5
			),
			event('approval.resolved', { approved: false }, 5),
			event('tick.completed', {}, 5)
		];
		expect(decisionExplanation(denied, denied[0]!.id)).toMatchObject({
			approval: { requested: true, approved: false, reason: 'ask' },
			result: undefined
		});
		expect(
			explanationsForTicks([...blocked, ...stopped, ...denied], [3, 5]).map((e) => e.tick)
		).toEqual([3, 5]);
	});

	it.each(GOLDENS)('every decision of %s, explained — the snapshot', (rel) => {
		const events = golden(rel);
		const explanations = events
			.filter((row) => row.type === 'decision')
			.map((row) => decisionExplanation(events, row.id));
		expect(explanations.length).toBeGreaterThan(0);
		for (const explanation of explanations) {
			expect(explanation).toBeDefined();
			expect(explanation?.related.length).toBeGreaterThanOrEqual(2);
			expect(explanation?.related).toContain(explanation?.decisionEventId);
		}
		expect(explanations).toMatchSnapshot();
	});
});
