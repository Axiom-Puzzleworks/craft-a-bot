import { obedient } from '@craftabot/core/testing';
import {
	TIDY_TOGETHER_SEAT_A,
	TIDY_TOGETHER_SEAT_B,
	buildSpec,
	runGroupToCompletion
} from '@craftabot/pack-starter/testing';
import { describe, expect, it } from 'vitest';
import { recordGroupEpisode } from './group-recorder.js';
import { createMemoryStorage } from './storage-memory.js';

/**
 * **WP29 stage F** (`23-MULTI-AGENT-DESIGN.md` §4.7, §10): a real `SessionGroup`
 * episode (the same one stage E's own DoD proof runs), turned into stored
 * rows and read back out through the ordinary `Storage` surface.
 */

const ROBO_SPEC = buildSpec({
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Robo',
	goalCardId: 'starter/tidy-together'
});
const BOLT_SPEC = buildSpec({
	id: '22222222-2222-4222-8222-222222222222',
	name: 'Bolt',
	goalCardId: 'starter/tidy-together'
});

function twoSeats() {
	return [
		{ script: obedient(TIDY_TOGETHER_SEAT_A), spec: ROBO_SPEC },
		{ script: obedient(TIDY_TOGETHER_SEAT_B), spec: BOLT_SPEC }
	];
}

async function recordedEpisode(pinned = false) {
	const run = await runGroupToCompletion({ members: twoSeats() });
	const storage = createMemoryStorage();
	const groupRun = await recordGroupEpisode(
		storage,
		{
			groupRunId: run.groupRunId,
			goalCardId: 'starter/tidy-together',
			members: [
				{ spec: ROBO_SPEC, events: run.memberEvents[0] ?? [] },
				{ spec: BOLT_SPEC, events: run.memberEvents[1] ?? [] }
			],
			mergedEvents: run.events
		},
		{ pinned }
	);
	return { storage, run, groupRun };
}

describe('recordGroupEpisode', () => {
	it('writes a GroupRunRecord that matches what the group actually did', async () => {
		const { run, groupRun } = await recordedEpisode();
		expect(groupRun.id).toBe(run.groupRunId);
		expect(groupRun.goalCardId).toBe('starter/tidy-together');
		expect(groupRun.outcome).toBe('SUCCESS');
		expect(groupRun.rounds).toBe(12);
		expect(groupRun.memberAgentIds.sort()).toEqual(
			['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'].sort()
		);
	});

	it('is readable back from the group-runs store', async () => {
		const { storage, groupRun } = await recordedEpisode();
		expect(await storage.getGroupRun(groupRun.id)).toEqual(groupRun);
		expect(await storage.listGroupRuns()).toEqual([groupRun]);
	});

	it('stores the merged stream under the group’s own id', async () => {
		const { storage, run, groupRun } = await recordedEpisode();
		const stored = await storage.getEvents(groupRun.id);
		expect(stored.map((row) => row.event)).toEqual(run.events);
	});

	it('writes each member as its own RunRecord, carrying groupRunId back', async () => {
		const { storage, groupRun } = await recordedEpisode();
		for (const runId of groupRun.memberRunIds) {
			const memberRun = await storage.getRun(runId);
			expect(memberRun).toBeDefined();
			expect(memberRun?.groupRunId).toBe(groupRun.id);
			expect(memberRun?.outcome).toBe('SUCCESS');
		}
	});

	it('a member’s own trace, read back, opens standalone — run.started first, run.finished last', async () => {
		const { storage, groupRun } = await recordedEpisode();
		const [firstRunId] = groupRun.memberRunIds;
		const stored = await storage.getEvents(firstRunId ?? '');
		expect(stored[0]?.event.type).toBe('run.started');
		expect(stored.at(-1)?.event.type).toBe('run.finished');
	});

	it('honours the pinned option on both the group row and its members', async () => {
		const { storage, groupRun } = await recordedEpisode(true);
		expect(groupRun.pinned).toBe(true);
		for (const runId of groupRun.memberRunIds) {
			expect((await storage.getRun(runId))?.pinned).toBe(true);
		}
	});
});
