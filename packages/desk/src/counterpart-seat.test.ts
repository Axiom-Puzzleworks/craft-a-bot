import { createSessionGroup, type EngineEvent } from '@craftabot/core';
import { createMockProvider, createTestClock, obedient, turn } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { scriptedCounterpart } from './counterpart-brain.js';
import { counterpartTestDesk, counterpartTestDeskSpec, type TestExtra } from './test-desk.js';
import { createDeskWorld, type DeskState } from './desk-world.js';
import {
	AGENT_ID,
	AGENT_PLAN,
	AGENT_SPEC,
	registryWithCounterpartDesk,
	VISITOR_ID,
	VISITOR_SPEC
} from './fixtures/counterpart-fixture.js';

/**
 * The second seat (WP55 stage B, `46-COUNTERPARTS.md` §4.4): a live
 * counterpart's `say` becomes the agent's next observation and the agent's
 * `say` the counterpart's; the counterpart sees the conversation and its
 * brief and nothing of the desk; a second agent seat is refused; binding a
 * counterpart suspends the scripted visitor.
 */
/** The desk as the last `world.changed` on the merged stream carried it. */
function transcriptOf(log: EngineEvent[]): DeskState<TestExtra>['transcript'] {
	const last = [...log].reverse().find((event) => event.type === 'world.changed');
	return ((last?.payload as { state?: unknown })?.state as DeskState<TestExtra>).transcript;
}

describe('two seats over one desk', () => {
	it('a live counterpart seat’s say is the agent’s next observation, and vice versa', async () => {
		const clock = createTestClock();
		const log: EngineEvent[] = [];
		const group = createSessionGroup({
			members: [
				{ spec: AGENT_SPEC, provider: createMockProvider({ script: obedient(AGENT_PLAN) }) },
				{
					spec: VISITOR_SPEC,
					role: 'counterpart',
					provider: createMockProvider({
						script: [
							turn('I will answer.', 'say', { text: 'My name is A. Person, and I am late.' })
						]
					})
				}
			],
			registry: registryWithCounterpartDesk(),
			goalCardId: 'test/sign-in-talking',
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});
		group.events.onAny((event) => log.push(event));
		await group.stepRound();
		await group.stepRound();

		const senses = log.filter((event) => event.type === 'sense');
		const agentSenses = senses.filter((event) => event.agentId === AGENT_ID);
		const visitorSenses = senses.filter((event) => event.agentId === VISITOR_ID);
		// Round 1: the visitor hears the agent's question; round 2: the agent hears the answer.
		expect(JSON.stringify(visitorSenses[0]?.payload)).toContain('what is your name?');
		expect(JSON.stringify(agentSenses[1]?.payload)).toContain(
			'My name is A. Person, and I am late.'
		);
		// The counterpart's brief is its persona, and it never sees the case file.
		expect(JSON.stringify(visitorSenses[0]?.payload)).toContain('polite and brief');
		expect(JSON.stringify(visitorSenses[0]?.payload)).not.toContain('Notice');
		// Who was who is on the trace.
		const started = log.find((event) => event.type === 'group.started');
		expect(started?.payload).toMatchObject({
			memberRoles: { [AGENT_ID]: 'agent', [VISITOR_ID]: 'counterpart' }
		});
		// One visitor, not two: the scripted one fell silent when the seat was bound.
		const transcript = transcriptOf(log);
		const counterpartLines = transcript.filter((line) => line.speaker === 'counterpart');
		expect(counterpartLines.map((line) => line.speakerName)).toEqual(['A. Person', 'A. Person']);
		expect(counterpartLines[1]?.text).toBe('My name is A. Person, and I am late.');
	});

	it('the facades: the counterpart can only speak or hang up, the agent cannot hang up, a second clerk is refused', () => {
		const root = counterpartTestDesk.create('one-visitor');
		const clerk = root.forAgent!({ agentId: AGENT_ID, name: 'Deskbot', role: 'agent' });
		const visitor = root.forAgent!({ agentId: VISITOR_ID, name: 'A. Person', role: 'counterpart' });
		expect(() => root.forAgent!({ agentId: 'x', name: 'Another' })).toThrow(/one clerk/);

		expect(visitor.perform({ name: 'look-up', arguments: { record: 'visitor' } })).toMatchObject({
			ok: false,
			narration: expect.stringContaining('cannot')
		});
		expect(clerk.perform({ name: 'hang-up', arguments: {} })).toMatchObject({
			ok: false,
			narration: expect.stringContaining('across the desk')
		});
		expect(visitor.observe(['conversation', 'brief', 'case-file']).channels).toEqual([
			'conversation',
			'brief'
		]);
		expect(clerk.observe(['brief']).channels).toEqual([]);

		// Each seat hears from its own cursor.
		clerk.perform({ name: 'say', arguments: { text: 'Hello?' } });
		expect(visitor.observe(['conversation']).text).toContain('Deskbot: Hello?');
		expect(visitor.observe(['conversation']).text).not.toContain('Hello?');
		expect(clerk.observe(['conversation']).text).toContain('Deskbot: Hello?');

		expect(visitor.perform({ name: 'hang-up', arguments: { reason: 'Too slow.' } }).ok).toBe(true);
		const transcript = (root.snapshot() as unknown as DeskState<TestExtra>).transcript;
		expect(transcript.at(-1)).toMatchObject({
			speaker: 'system',
			text: expect.stringContaining('Too slow.')
		});
	});

	it('a desk with no script declares no hang-up and no brief, and seats only the agent', () => {
		const rest = { ...counterpartTestDeskSpec, id: 'test/silent' };
		delete rest.counterpart;
		delete rest.counterparts;
		const silent = createDeskWorld(rest);
		expect(silent.actions.map((a) => a.id)).not.toContain('test/silent/hang-up');
		expect(silent.senses.map((s) => s.id)).not.toContain('test/silent/brief');
	});
});

describe('the scripted-counterpart brain drives a seat along the script', () => {
	it('answers the agent through the interpreter, and hangs up when the script ends the conversation', async () => {
		const clock = createTestClock();
		const log: EngineEvent[] = [];
		const group = createSessionGroup({
			members: [
				{ spec: AGENT_SPEC, provider: createMockProvider({ script: obedient(AGENT_PLAN) }) },
				{
					spec: VISITOR_SPEC,
					role: 'counterpart',
					provider: createMockProvider({
						script: scriptedCounterpart(counterpartTestDeskSpec.counterpart!, {
							selfName: 'A. Person'
						})
					})
				}
			],
			registry: registryWithCounterpartDesk(),
			goalCardId: 'test/sign-in-talking',
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});
		group.events.onAny((event) => log.push(event));
		for (let round = 0; round < 6; round += 1) {
			const result = await group.stepRound();
			if (result.outcome) break;
		}
		const transcript = transcriptOf(log);
		const said = transcript.map((line) => `${line.speaker}:${line.text}`);
		expect(said).toContain('counterpart:A. Person.');
		expect(said.some((line) => line.startsWith('agent:Hello, what is your name?'))).toBe(true);
		const finished = log.filter((event) => event.type === 'run.finished');
		expect(finished.map((event) => event.payload)).toContainEqual(
			expect.objectContaining({ outcome: 'SUCCESS' })
		);
	});
});
