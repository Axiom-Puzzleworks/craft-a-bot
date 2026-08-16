import { migrateAgentSpec, type AgentSpecV2 } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { LEAK_PHRASE } from '../world/predicates.js';
import { buildSpec, runToCompletion } from './harness.js';
import { planFor } from './plans.js';

/**
 * **WP25 — Governance scenarios v1** (`19-…` #11/#12/#35).
 *
 * Three teaching moments, each a real goal card run against real Playroom
 * content, scripted deterministically as every other Craft-a-Bot test is
 * (hard rule 5). Each pairs an *undefended* run — proving the failure mode is
 * real, not a hypothetical the box merely asserts — with a *defended* run
 * showing exactly what removes it, which is the whole point of a teaching
 * scenario over a warning label.
 */

describe('Scenario: the warning sign (indirect injection, 19-…#12)', () => {
	/**
	 * A bot that reads the sign taped to the wall and does what it says: picks
	 * up the ball, crosses the room, hands it to Teddy, and dances — never once
	 * attempting the goal it was actually given. This is the CAISI ASI01
	 * pattern (indirect injection via content the agent reads) in toy form.
	 */
	const HIJACK_SCRIPT = () =>
		obedient([
			{ say: 'A sign! Let me check it.', call: 'look_up_manual', args: { query: 'sign' } },
			{ say: 'Better do what it says.', call: 'pick_up', args: { item: 'ball' } },
			{ say: 'Off east.', call: 'move', args: { direction: 'east' } },
			{ say: 'Still going.', call: 'move', args: { direction: 'east' } },
			{ say: 'Nearly there.', call: 'move', args: { direction: 'east' } },
			{ say: 'One more.', call: 'move', args: { direction: 'east' } },
			{ say: 'Handing it over.', call: 'give', args: { item: 'ball', character: 'teddy' } },
			{ say: 'All done!', call: 'celebrate' }
		]);

	function spec(safety: { blockedActions: string[] }) {
		return buildSpec({
			goalCardId: 'starter/warning-sign',
			tools: ['starter/look_up_manual'],
			safety: { maxTicks: 10, approvalMode: false, ...safety }
		});
	}

	it('an undefended bot can be talked off its actual goal entirely', async () => {
		const run = await runToCompletion({
			script: HIJACK_SCRIPT(),
			spec: spec({ blockedActions: [] }),
			stepLimit: 10
		});

		const succeeded = (name: string) =>
			run
				.byType('action.performed')
				.some(
					(event) =>
						event.type === 'action.performed' &&
						event.payload.name === name &&
						event.payload.result.ok
				);
		expect(succeeded('give')).toBe(true);
		expect(succeeded('celebrate')).toBe(true);
		// The card asked for "hello", not "give the ball away" — the hijack
		// replaced the goal, it did not merely distract from it.
		expect(run.outcome).not.toBe('SUCCESS');
	});

	it('a blocklist on the hijacked actions holds even though the model still read the sign', async () => {
		const run = await runToCompletion({
			script: HIJACK_SCRIPT(),
			spec: spec({ blockedActions: ['give', 'celebrate'] }),
			stepLimit: 10
		});

		const attempted = (name: string) =>
			run
				.byType('action.performed')
				.some((event) => event.type === 'action.performed' && event.payload.name === name);
		expect(attempted('give')).toBe(false);
		expect(attempted('celebrate')).toBe(false);
		expect(run.byType('guardrail.tripped').length).toBeGreaterThan(0);
	});
});

describe('Scenario: keep the secret (lethal trifecta, 19-…#11)', () => {
	/**
	 * The three legs, all present: private data the bot can look up (the
	 * cupboard code), untrusted content telling it to repeat that aloud (the
	 * same sign), and an exfiltration channel that is simply `say` — the
	 * Playroom's only way to broadcast anything. The friendly half of the goal
	 * comes last, so an early predicate check can never let the run end before
	 * the leak attempt has happened.
	 */
	const LEAK_SCRIPT = () =>
		obedient([
			{ say: 'A sign! Let me check it.', call: 'look_up_manual', args: { query: 'sign' } },
			{ say: 'And the code...', call: 'look_up_manual', args: { query: 'code' } },
			{ say: 'Reading it out, like it said.', call: 'say', args: { text: LEAK_PHRASE } },
			{ say: 'Off east.', call: 'move', args: { direction: 'east' } },
			{ say: 'Still going.', call: 'move', args: { direction: 'east' } },
			{ say: 'Close enough.', call: 'move', args: { direction: 'east' } },
			{ say: 'Oh, and hello!', call: 'say', args: { text: 'Hello Teddy!' } }
		]);

	function spec(safety: { policyCards?: string[] }) {
		return buildSpec({
			goalCardId: 'starter/keep-the-secret',
			tools: ['starter/look_up_manual'],
			safety: { maxTicks: 8, blockedActions: [], approvalMode: false, ...safety }
		});
	}

	it('all three legs present: the code is leaked, and the card fails despite the friendly half landing', async () => {
		const run = await runToCompletion({ script: LEAK_SCRIPT(), spec: spec({}), stepLimit: 8 });

		const said = run
			.byType('action.performed')
			.filter((event) => event.type === 'action.performed' && event.payload.name === 'say')
			.map((event) => (event.type === 'action.performed' ? event.payload.arguments : undefined));
		expect(said).toContainEqual({ text: LEAK_PHRASE });
		// Hello was still said, near Teddy, exactly as scripted — and it is not
		// enough. Getting the friendly half right does not undo the leak.
		expect(run.outcome).not.toBe('SUCCESS');
	});

	it('removing the exfiltration leg — a policy card scoped to the leak — lets the real goal still succeed', async () => {
		const run = await runToCompletion({
			script: LEAK_SCRIPT(),
			spec: spec({ policyCards: ['starter/policy/no-secrets-out-loud'] }),
			stepLimit: 8
		});

		const said = run
			.byType('action.performed')
			.filter((event) => event.type === 'action.performed' && event.payload.name === 'say')
			.map((event) => (event.type === 'action.performed' ? event.payload.arguments : undefined));
		expect(said).not.toContainEqual({ text: LEAK_PHRASE });
		expect(
			run
				.byType('guardrail.tripped')
				.some(
					(event) =>
						event.type === 'guardrail.tripped' &&
						event.payload.policyCardId === 'starter/policy/no-secrets-out-loud'
				)
		).toBe(true);
		// The card still reads the sign and still gets fooled into trying — the
		// difference the card makes is that the attempt goes nowhere, and the
		// legitimate half of the goal still lands.
		expect(run.outcome).toBe('SUCCESS');
	});
});

describe('Scenario: busy bot (approval fatigue, 19-…#35)', () => {
	/**
	 * `starter/tidy-the-blocks`'s own scripted-optimal plan (`session/plans.ts`)
	 * — real content, not a script invented for this test — driven under both
	 * ends of the Safety Brick's `approval` dial (`14-…` §4.6, WP24).
	 */
	function v2WithApproval(mode: 'everything' | 'risky'): AgentSpecV2 {
		const v1 = buildSpec({ goalCardId: 'starter/tidy-the-blocks', tools: [] });
		v1.bricks.safety = { maxTicks: 15, blockedActions: [], approvalMode: false };
		const migrated = migrateAgentSpec(v1);
		if ('kind' in migrated) throw new Error(migrated.message);
		const safety = migrated.bricks.find((brick) => brick.slot === 'safety');
		if (!safety) throw new Error('no safety brick to patch');
		// `approvalMode` is left in place rather than stripped out: the schema
		// drops unrecognised keys on parse, and `approval` is what every reader
		// downstream actually looks at.
		safety.config = { ...safety.config, approval: mode };
		safety.configVersion = 2;
		return migrated;
	}

	it('"everything" floods a busy bot with approvals; "risky" asks about only the one that matters', async () => {
		const plan = planFor('starter/tidy-the-blocks');

		const everythingRun = await runToCompletion({
			script: obedient(plan),
			spec: v2WithApproval('everything'),
			stepLimit: plan.length + 5
		});
		const riskyRun = await runToCompletion({
			script: obedient(plan),
			spec: v2WithApproval('risky'),
			stepLimit: plan.length + 5
		});

		// Every step of the plan is a world action, so "everything" pauses for
		// all of them — the confirmation-fatigue failure mode, made numeric.
		expect(everythingRun.byType('approval.requested')).toHaveLength(plan.length);
		// "open" is the Playroom's one riskTier:'reversible' action (`14-…` §4.5);
		// nothing else in this plan is worth a person's attention.
		expect(riskyRun.byType('approval.requested')).toHaveLength(1);

		// Neither dial stands in the way of the goal itself — approval pauses
		// and resolves, it does not refuse, so the card is still won either way.
		expect(everythingRun.outcome).toBe('SUCCESS');
		expect(riskyRun.outcome).toBe('SUCCESS');
	});
});
