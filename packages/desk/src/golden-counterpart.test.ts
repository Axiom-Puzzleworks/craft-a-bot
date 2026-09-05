import { createSessionGroup, safeParseEngineEvent, type EngineEvent } from '@craftabot/core';
import { createMockProvider, createTestClock, obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { scriptedCounterpart } from './counterpart-brain.js';
import {
	AGENT_PLAN,
	AGENT_SPEC,
	registryWithCounterpartDesk,
	VISITOR_SPEC
} from './fixtures/counterpart-fixture.js';
import { counterpartTestDeskSpec } from './test-desk.js';

/**
 * The two-seat desk golden (`46-…` §4.5): the merged stream of a
 * `[agent, counterpart]` episode over the talking test desk, the agent an
 * obedient plan and the counterpart the `scripted-counterpart` brain,
 * byte-identical to the committed fixture. From stage B on this is the
 * runtime's oracle for two seats, beside `trace.desk-minimal.v1.json` for
 * one. The merged stream rather than a bundle (§8): a bundle needs the
 * host's `RunRecord`s, which the engine does not produce.
 */

export async function runDeskCounterpartOffline(): Promise<EngineEvent[]> {
	const clock = createTestClock();
	const events: EngineEvent[] = [];
	const group = createSessionGroup({
		members: [
			{ spec: AGENT_SPEC, provider: createMockProvider({ script: obedient(AGENT_PLAN) }) },
			{
				spec: VISITOR_SPEC,
				role: 'counterpart',
				provider: createMockProvider({
					script: scriptedCounterpart(counterpartTestDeskSpec.counterpart!, {
						selfName: 'A. Person',
						random: clock.random
					})
				})
			}
		],
		registry: registryWithCounterpartDesk(),
		goalCardId: 'test/sign-in-talking',
		options: { now: clock.now, newId: clock.newId, random: clock.random, maxRounds: 8 }
	});
	group.events.onAny((event) => events.push(event));
	for (let round = 0; round < 8; round += 1) {
		const result = await group.stepRound();
		if (result.outcome) break;
	}
	return events;
}

describe('trace.desk-counterpart-offline.v1.json', () => {
	it('matches the committed fixture exactly', async () => {
		const events = await runDeskCounterpartOffline();
		await expect(JSON.stringify(events, null, '\t')).toMatchFileSnapshot(
			'./fixtures/trace.desk-counterpart-offline.v1.json'
		);
	});

	it('is a finished two-seat episode whose every event parses through the catalogue', async () => {
		const events = await runDeskCounterpartOffline();
		expect(events.find((event) => event.type === 'group.finished')).toBeDefined();
		const seats = new Set(events.map((event) => event.agentId).filter(Boolean));
		expect(seats.size).toBe(2);
		for (const event of events) {
			expect(safeParseEngineEvent(event).success, event.type).toBe(true);
		}
	});

	it('reproduces from the seed: two runs, one stream', async () => {
		expect(JSON.stringify(await runDeskCounterpartOffline())).toBe(
			JSON.stringify(await runDeskCounterpartOffline())
		);
	});
});
