import { migrateAgentSpec, type EngineEvent } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { buildSpec, runToCompletion } from '@craftabot/pack-starter/testing';
import { describe, expect, it } from 'vitest';
import {
	applyPlannerEvent,
	emptyPlannerProjection,
	projectPlannerThrough
} from './planner-projection.js';

/**
 * **WP30 stage C**: the Planner checklist's own fold, mirroring
 * `run-projection.ts`'s own `empty*`/`apply*`/`project*Through` trio so a
 * live view and a replay can never disagree.
 *
 * Proven twice, the same split the Planner brick itself was tested with
 * (`pack-starter`'s `planner.test.ts`): hand-built envelopes for the fold's
 * own rules, then a real session's real trace for the thing that actually
 * matters — that the workbench reads what the brick really reported.
 */

let seq = 0;
function brickState(tick: number, kind: string, state: unknown): EngineEvent {
	seq += 1;
	return {
		id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
		runId: 'run-1',
		tick,
		timestamp: '2026-08-20T09:00:00.000Z',
		type: 'brick.state',
		payload: { slot: 'planner', kind, state }
	} as EngineEvent;
}

describe('the fold, over hand-built events', () => {
	it('has nothing to show before any brick.state arrives', () => {
		expect(emptyPlannerProjection().state).toBeUndefined();
	});

	it('picks up a starter/planner report', () => {
		const projection = emptyPlannerProjection();
		applyPlannerEvent(
			projection,
			brickState(1, 'starter/planner', { steps: ['a'], done: [false] })
		);
		expect(projection.state).toEqual({ steps: ['a'], done: [false] });
	});

	it('ignores a brick.state from a different kind in the same slot', () => {
		const projection = emptyPlannerProjection();
		applyPlannerEvent(projection, brickState(1, 'expansion/other-planner', { anything: true }));
		expect(projection.state).toBeUndefined();
	});

	it('ignores events of every other type', () => {
		const projection = emptyPlannerProjection();
		applyPlannerEvent(projection, {
			id: '00000000-0000-4000-8000-000000000099',
			runId: 'run-1',
			tick: 1,
			timestamp: '2026-08-20T09:00:00.000Z',
			type: 'tick.started',
			payload: {}
		} as EngineEvent);
		expect(projection.state).toBeUndefined();
	});

	it('a later report replaces an earlier one — the latest belief, not a history', () => {
		const events = [
			brickState(1, 'starter/planner', { steps: ['a'], done: [false] }),
			brickState(2, 'starter/planner', { steps: ['a'], done: [true] })
		];
		expect(projectPlannerThrough(events).state).toEqual({ steps: ['a'], done: [true] });
	});

	it('stops folding past throughTick, for the scrubber', () => {
		const events = [
			brickState(1, 'starter/planner', { steps: ['a'], done: [false] }),
			brickState(2, 'starter/planner', { steps: ['a'], done: [true] })
		];
		expect(projectPlannerThrough(events, 1).state).toEqual({ steps: ['a'], done: [false] });
	});
});

describe('the fold, over a real session', () => {
	it('reads the exact steps and done-flags a real Planner brick reported', async () => {
		const migrated = migrateAgentSpec(buildSpec());
		if ('kind' in migrated) throw new Error(migrated.message);
		migrated.bricks.push({
			slot: 'planner',
			kind: 'starter/planner',
			config: {},
			configVersion: 1
		});

		const run = await runToCompletion({
			script: obedient([
				{
					say: 'Planning.',
					call: 'make_plan',
					args: { steps: ['Find the key', 'Open the chest'] }
				},
				{ say: 'Checking off.', call: 'check_off_step', args: { index: 1 } },
				{ say: 'Done for now.', call: 'say', args: { text: 'Hi' } }
			]),
			spec: migrated,
			maxTicks: 3
		});

		expect(projectPlannerThrough(run.events).state).toEqual({
			steps: ['Find the key', 'Open the chest'],
			done: [true, false]
		});
	});

	it('reports nothing for a bot with no Planner brick fitted', async () => {
		const run = await runToCompletion({
			script: obedient([{ say: 'Hi.', call: 'say', args: { text: 'Hi' } }]),
			spec: buildSpec(),
			maxTicks: 1
		});

		expect(projectPlannerThrough(run.events).state).toBeUndefined();
	});
});
