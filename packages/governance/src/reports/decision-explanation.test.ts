import type { EngineEvent } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { reasonsUsed } from './decision-explanation.js';

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
