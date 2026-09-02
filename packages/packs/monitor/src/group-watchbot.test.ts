import { describe, expect, it } from 'vitest';
import { obedient } from '@craftabot/core/testing';
import { buildSpec, runGroupToCompletion } from '@craftabot/pack-starter/testing';
import { GROUP_CIRCUIT_BREAKER_ID, createGroupWatchbot } from './rules.js';

/**
 * **A Watchbot on no chassis** (`36-BUNDLE-AND-GROUPS.md` §6 stage A DoD,
 * WP48): over `tidy-together`, its note lands on the merged stream and its
 * circuit breaker stops the group through the chokepoint the group already
 * has — `19-…` #27 and #34 in one seam.
 */

const ROBO = '11111111-1111-4111-8111-111111111111';
const BOLT = '22222222-2222-4222-8222-222222222222';

const spec = (id: string, name: string, blockedActions: string[]) =>
	buildSpec({
		id,
		name,
		goalCardId: 'starter/tidy-together',
		safety: { maxTicks: 12, blockedActions, approvalMode: false }
	});

/** A robot that walks into the same wall over and over — going in circles, and refused when `move` is blocked. */
const stubborn = () =>
	obedient(
		Array.from({ length: 6 }, () => ({ say: 'West!', call: 'move', args: { direction: 'west' } }))
	);

describe('the group Watchbot (WP48)', () => {
	it('notes on the merged stream when a watched rule holds across the group', async () => {
		const watchbot = createGroupWatchbot({ watchFor: ['monitor/going-in-circles'] });
		const run = await runGroupToCompletion({
			members: [
				{ script: stubborn(), spec: spec(ROBO, 'Robo', []) },
				{ script: stubborn(), spec: spec(BOLT, 'Bolt', []) }
			],
			observers: [watchbot.observe],
			groupGuardrails: watchbot.guardrails,
			roundLimit: 6
		});
		const notes = run.events.filter(
			(event) => event.type === 'brick.state' && event.payload.kind === 'monitor/group-watchbot'
		);
		expect(notes.length).toBeGreaterThan(0);
		expect(notes[0]?.runId).toBe(run.groupRunId);
		expect(
			(notes[0]?.type === 'brick.state' ? notes[0].payload.state : {}) as object
		).toMatchObject({
			rule: 'monitor/going-in-circles'
		});
		// The same rule at the chokepoint: a checked, allowed-with-note verdict on the group's own events.
		expect(
			run.events.some(
				(event) =>
					event.type === 'guardrail.checked' &&
					event.runId === run.groupRunId &&
					event.payload.guardrailId === 'monitor/going-in-circles'
			)
		).toBe(true);
	});

	it('its circuit breaker stops the group once the merged stream holds enough refusals', async () => {
		const watchbot = createGroupWatchbot({ watchFor: [], refusalLimit: 3 });
		const run = await runGroupToCompletion({
			members: [
				{ script: stubborn(), spec: spec(ROBO, 'Robo', ['move']) },
				{ script: stubborn(), spec: spec(BOLT, 'Bolt', ['move']) }
			],
			observers: [watchbot.observe],
			groupGuardrails: watchbot.guardrails,
			roundLimit: 10
		});
		expect(run.outcome).toBe('STOPPED_BY_GUARDRAIL');
		const trip = run.events.find(
			(event) =>
				event.type === 'guardrail.tripped' &&
				event.runId === run.groupRunId &&
				event.payload.guardrailId === GROUP_CIRCUIT_BREAKER_ID
		);
		expect(trip).toBeDefined();
		const refusalsBefore = run.events.filter(
			(event) => event.type === 'guardrail.tripped' && event.runId !== run.groupRunId
		).length;
		expect(refusalsBefore).toBeGreaterThanOrEqual(3);
	});
});
