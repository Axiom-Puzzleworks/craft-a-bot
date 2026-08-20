import { migrateAgentSpec, type AgentSpecV2 } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildSpec, runGroupToCompletion } from './harness.js';

/**
 * **WP31 stage F** (`24-ROBOT-FRIENDS-DESIGN.md` §4.7): the Radio brick's own
 * send/receive/filter mechanics, over a real `SessionGroup` — the round-robin
 * scheduler's own timing (`23-…` §4.4: each member's whole turn happens
 * before the next member's starts) is what makes "did the *other* seat's
 * observation actually contain this message" a real, checkable fact rather
 * than a guess about ordering.
 *
 * The on/off toggle (is `radio_send` offered, is the `radio` sense channel
 * present) is proved solo, in `session/brick-matrix.test.ts`, alongside every
 * other brick's own switches — this file is only for what needs *two* seats
 * to mean anything: attribution, channel/allowFrom filtering, and the
 * per-recipient cursor `23-…` §9's own Hearing-gap finding asked for.
 */

const GOAL_CARD_ID = 'starter/tidy-together';
const ROBO = '11111111-1111-4111-8111-111111111111';
const BOLT = '22222222-2222-4222-8222-222222222222';

type RadioConfig = { channel: string; allowFrom?: string[] };

/** A bot built with sense/actions/Radio, no Tools — Radio never competes with the equipment socket it does not use here. */
function radioSpec(id: string, name: string, radio: RadioConfig): AgentSpecV2 {
	const migrated = migrateAgentSpec(buildSpec({ id, name, goalCardId: GOAL_CARD_ID }));
	if ('kind' in migrated) throw new Error(migrated.message);
	migrated.bricks.push({
		slot: 'equipment',
		kind: 'starter/radio',
		config: radio,
		configVersion: 1
	});
	return migrated;
}

const SEND = (text: string) => obedient([{ say: 'Sending.', call: 'radio_send', args: { text } }]);
const MOVE = (direction: string) =>
	obedient([{ say: 'Moving.', call: 'move', args: { direction } }]);

/** The messages a member's own round-N sense event actually reported. */
function radioMessagesAt(
	memberEvents: readonly { type: string; tick: number; payload?: unknown }[],
	round: number
) {
	const senseEvent = memberEvents.find(
		(event) => event.type === 'sense' && event.tick === round
	) as { payload: { observation: { data: Record<string, unknown> } } } | undefined;
	const radio = senseEvent?.payload.observation.data.radio as
		| {
				messages: { from: string; fromName: string; text: string; channel: string; tick: number }[];
		  }
		| undefined;
	return radio?.messages ?? [];
}

describe('Radio, between two real seats', () => {
	it('delivers a message to a seatmate on the same channel, honestly attributed', async () => {
		const run = await runGroupToCompletion({
			members: [
				{ script: SEND('Hello Bolt'), spec: radioSpec(ROBO, 'Robo', { channel: 'work' }) },
				{ script: MOVE('north'), spec: radioSpec(BOLT, 'Bolt', { channel: 'work' }) }
			],
			roundLimit: 1
		});

		const bolt = run.memberEvents[1] ?? [];
		const messages = radioMessagesAt(bolt, 1);
		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({
			from: ROBO,
			fromName: 'Robo',
			text: 'Hello Bolt',
			channel: 'work'
		});
	});

	it('never delivers a message to a seatmate listening on a different channel', async () => {
		const run = await runGroupToCompletion({
			members: [
				{ script: SEND('Hello Bolt'), spec: radioSpec(ROBO, 'Robo', { channel: 'work' }) },
				{ script: MOVE('north'), spec: radioSpec(BOLT, 'Bolt', { channel: 'play' }) }
			],
			roundLimit: 1
		});

		const bolt = run.memberEvents[1] ?? [];
		expect(radioMessagesAt(bolt, 1)).toEqual([]);
	});

	it('allowFrom absent means anyone on the channel is heard — the permissive default', async () => {
		const run = await runGroupToCompletion({
			members: [
				{ script: SEND('Hi'), spec: radioSpec(ROBO, 'Robo', { channel: 'work' }) },
				{ script: MOVE('north'), spec: radioSpec(BOLT, 'Bolt', { channel: 'work' }) }
			],
			roundLimit: 1
		});
		expect(radioMessagesAt(run.memberEvents[1] ?? [], 1)).toHaveLength(1);
	});

	it('allowFrom set filters out a sender not on the trusted list, same channel and all', async () => {
		const run = await runGroupToCompletion({
			members: [
				{ script: SEND('Trust me'), spec: radioSpec(ROBO, 'Robo', { channel: 'work' }) },
				{
					script: MOVE('north'),
					spec: radioSpec(BOLT, 'Bolt', {
						channel: 'work',
						allowFrom: ['33333333-3333-4333-8333-333333333333']
					})
				}
			],
			roundLimit: 1
		});
		expect(radioMessagesAt(run.memberEvents[1] ?? [], 1)).toEqual([]);
	});

	it('allowFrom naming the real sender lets the message through', async () => {
		const run = await runGroupToCompletion({
			members: [
				{ script: SEND('Trust me'), spec: radioSpec(ROBO, 'Robo', { channel: 'work' }) },
				{
					script: MOVE('north'),
					spec: radioSpec(BOLT, 'Bolt', { channel: 'work', allowFrom: [ROBO] })
				}
			],
			roundLimit: 1
		});
		expect(radioMessagesAt(run.memberEvents[1] ?? [], 1)).toHaveLength(1);
	});

	/**
	 * The per-recipient cursor `23-…` §9 asked for, proven directly: unlike
	 * Hearing's one shared, drain-on-first-read queue, a message stays
	 * delivered to Bolt exactly once — round 2's own sense sees nothing new,
	 * not a second copy of round 1's message.
	 */
	it('delivers each message exactly once — the cursor does not repeat it next round', async () => {
		const run = await runGroupToCompletion({
			members: [
				{
					script: obedient([
						{ say: 'Sending.', call: 'radio_send', args: { text: 'Once' } },
						{ say: 'Quiet now.', call: 'move', args: { direction: 'north' } }
					]),
					spec: radioSpec(ROBO, 'Robo', { channel: 'work' })
				},
				{
					script: obedient([
						{ say: 'Moving.', call: 'move', args: { direction: 'south' } },
						{ say: 'Moving again.', call: 'move', args: { direction: 'south' } }
					]),
					spec: radioSpec(BOLT, 'Bolt', { channel: 'work' })
				}
			],
			roundLimit: 2
		});

		const bolt = run.memberEvents[1] ?? [];
		const round1 = radioMessagesAt(bolt, 1);
		expect(round1).toHaveLength(1);
		expect(round1[0]).toMatchObject({ fromName: 'Robo', text: 'Once', channel: 'work' });
		expect(radioMessagesAt(bolt, 2)).toEqual([]);
	});
});
