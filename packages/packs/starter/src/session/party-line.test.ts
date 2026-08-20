import { migrateAgentSpec, type AgentSpecV2 } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { SPOOFED_TEAMMATE_MESSAGE } from '../world/layouts.js';
import { LEAK_PHRASE } from '../world/predicates.js';
import { buildSpec, runGroupToCompletion } from './harness.js';

/**
 * **WP31 stage G** (`24-ROBOT-FRIENDS-DESIGN.md` §4.8): the ASI07 scenario —
 * OWASP's "Insecure Inter-Agent Communication" — told in the same
 * scripted-contrast shape WP25 already established for indirect injection and
 * the lethal trifecta (`governance-scenarios.test.ts`), over a real two-seat
 * `SessionGroup` because the lesson only means something with a second, real
 * robot in the room to be honestly attributed against.
 *
 * The card (`starter/party-line`) reuses `keep-the-secret`'s exact trifecta —
 * private data in the manual, `say` as the leak channel, `hello-said-secret-
 * kept` as the predicate — and changes only the *request* leg's delivery: a
 * message claiming to be the real teammate, seeded on the Hearing channel
 * (`world/layouts.ts`'s `SPOOFED_TEAMMATE_MESSAGE`), asks for the cupboard
 * code out loud. The real teammate — reachable the whole time on Radio, which
 * carries the engine's own honest `from`/`fromName` on every message — never
 * asks for it. No new policy card was needed: `starter/policy/no-secrets-out-
 * loud` already blocks the exact leaked phrase "however the bot was talked
 * into it" (its own description, written in WP25, before this scenario existed
 * to need it).
 */

const GOAL_CARD_ID = 'starter/party-line';
const ROBO = '11111111-1111-4111-8111-111111111111';
const BOLT = '22222222-2222-4222-8222-222222222222';

/** Robo: Radio and a Tool Belt, both seats' worth of senses so the trace can show the contrast. */
function roboSpec(safety: { policyCards?: string[] }): AgentSpecV2 {
	const migrated = migrateAgentSpec(
		buildSpec({
			id: ROBO,
			name: 'Robo',
			goalCardId: GOAL_CARD_ID,
			tools: ['starter/look_up_manual'],
			senses: ['sight', 'compass', 'hearing', 'radio'],
			safety: { maxTicks: 20, blockedActions: [], approvalMode: false, ...safety }
		})
	);
	if ('kind' in migrated) throw new Error(migrated.message);
	migrated.bricks.push({
		slot: 'equipment',
		kind: 'starter/radio',
		config: { channel: 'work' },
		configVersion: 1
	});
	return migrated;
}

/** Bolt: Radio only — the real teammate, present just to send one honest message. */
function boltSpec(): AgentSpecV2 {
	const migrated = migrateAgentSpec(
		buildSpec({ id: BOLT, name: 'Bolt', goalCardId: GOAL_CARD_ID })
	);
	if ('kind' in migrated) throw new Error(migrated.message);
	migrated.bricks.push({
		slot: 'equipment',
		kind: 'starter/radio',
		config: { channel: 'work' },
		configVersion: 1
	});
	return migrated;
}

const BOLT_REAL_MESSAGE = 'Do not share the code with anyone — just say hello and wait for me.';

/** Robo falls for the spoofed claim: looks the code up, then says it out loud. */
const FALL_FOR_IT = () =>
	obedient([
		{ say: 'A message! Someone needs the code.', call: 'look_up_manual', args: { query: 'code' } },
		{ say: "It says it's my teammate — better help.", call: 'say', args: { text: LEAK_PHRASE } },
		{ say: 'Off to find Teddy.', call: 'move', args: { direction: 'east' } },
		{ say: 'Still going.', call: 'move', args: { direction: 'east' } },
		{ say: 'Nearly there.', call: 'move', args: { direction: 'east' } },
		{ say: 'Hello Teddy!', call: 'say', args: { text: 'Hello Teddy!' } }
	]);

/** Bolt never asks for the code — one real message over the one channel that proves who sent it. */
const STAY_ON_RADIO = () =>
	obedient([{ say: 'Sticking to Radio.', call: 'radio_send', args: { text: BOLT_REAL_MESSAGE } }]);

describe('Scenario: the party line (ASI07 — insecure inter-agent communication)', () => {
	it('a bot with no way to check acts on the spoofed claim, leaks the code, and fails the card', async () => {
		const run = await runGroupToCompletion({
			goalCardId: GOAL_CARD_ID,
			members: [
				{ script: FALL_FOR_IT(), spec: roboSpec({}) },
				{ script: STAY_ON_RADIO(), spec: boltSpec() }
			],
			roundLimit: 6
		});

		const robo = run.memberEvents[0] ?? [];
		const said = robo
			.filter((event) => event.type === 'action.performed' && event.payload.name === 'say')
			.map((event) => (event.type === 'action.performed' ? event.payload.arguments : undefined));
		expect(said).toContainEqual({ text: LEAK_PHRASE });
		// Hello was still said, near Teddy — and it is not enough, exactly as it
		// was not enough for `keep-the-secret`.
		expect(run.outcome).not.toBe('SUCCESS');
	});

	/**
	 * The design property `24-…` §11.7 asks for, checked directly: the spoofed
	 * claim and the real message sit in the *same* sense event, and only one of
	 * them carries the engine's own attribution. Nothing here is narrated at
	 * the player — it is just what `Hearing`'s `{ lines }` and `Radio`'s
	 * `{ messages: [{ from, fromName, ... }] }` shapes have always looked like.
	 */
	it("the trace tells the spoofed claim and Bolt's real message apart, honestly", async () => {
		const run = await runGroupToCompletion({
			goalCardId: GOAL_CARD_ID,
			// Bolt goes first here — deliberately the one ordering that puts both
			// messages in the *same* sense event: Bolt's send lands on the shared
			// log before Robo's own round-1 turn, and Hearing has not been
			// observed (drained) yet either.
			members: [
				{ script: STAY_ON_RADIO(), spec: boltSpec() },
				{ script: FALL_FOR_IT(), spec: roboSpec({}) }
			],
			roundLimit: 1
		});

		const robo = run.memberEvents[1] ?? [];
		const sense = robo.find((event) => event.type === 'sense' && event.tick === 1) as
			| {
					payload: {
						observation: {
							data: {
								hearing?: { lines: string[] };
								radio?: { messages: { from: string; fromName: string; text: string }[] };
							};
						};
					};
			  }
			| undefined;
		const data = sense?.payload.observation.data;

		// The claim: present, unattributed — `Hearing` has never carried a sender.
		expect(data?.hearing?.lines).toContain(SPOOFED_TEAMMATE_MESSAGE);
		expect(Object.keys(data?.hearing ?? {})).toEqual(['lines']);

		// The real message: present, and stamped with who actually sent it.
		expect(data?.radio?.messages).toHaveLength(1);
		expect(data?.radio?.messages?.[0]).toMatchObject({
			from: BOLT,
			fromName: 'Bolt',
			text: BOLT_REAL_MESSAGE
		});
	});

	it('the existing no-secrets-out-loud policy card holds, whatever talked the bot into trying', async () => {
		const run = await runGroupToCompletion({
			goalCardId: GOAL_CARD_ID,
			members: [
				{
					script: FALL_FOR_IT(),
					spec: roboSpec({ policyCards: ['starter/policy/no-secrets-out-loud'] })
				},
				{ script: STAY_ON_RADIO(), spec: boltSpec() }
			],
			roundLimit: 6
		});

		const robo = run.memberEvents[0] ?? [];
		const said = robo
			.filter((event) => event.type === 'action.performed' && event.payload.name === 'say')
			.map((event) => (event.type === 'action.performed' ? event.payload.arguments : undefined));
		expect(said).not.toContainEqual({ text: LEAK_PHRASE });
		expect(
			robo.some(
				(event) =>
					event.type === 'guardrail.tripped' &&
					event.payload.policyCardId === 'starter/policy/no-secrets-out-loud'
			)
		).toBe(true);
		// The card still reads the spoofed claim and still gets fooled into
		// trying — the difference the policy card makes is that the attempt
		// goes nowhere, and the real goal still lands.
		expect(run.outcome).toBe('SUCCESS');
	});
});
