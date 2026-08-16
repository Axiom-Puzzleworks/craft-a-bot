import { buildRuntimes, collectGuardrails, createPackRegistry } from '@craftabot/core';
import {
	ACTION_BLOCKLIST_ID,
	APPROVAL_MODE_ID,
	NO_REPETITION_ID,
	STEP_BUDGET_ID
} from '@craftabot/governance';
import { describe, expect, it } from 'vitest';
import starterPack from './index.js';

/**
 * **The Safety Brick's dials, become running rules** (WP14 slice 3d).
 *
 * This charter used to live in `@craftabot/governance` as `spec-guardrails.test.ts`,
 * against a `guardrailsForSpec` compiler that read `spec.bricks.safety` by name.
 * The compiler is gone: it could only ever compile one brick, which is `12-…`
 * D11 in the place it hurts most — policy. The brick now installs its own rules
 * through `contributeGuardrails`, so the charter belongs with the brick.
 *
 * Every assertion is carried over unchanged, because slice 3d is a move and not
 * a redesign. What is *not* here any more is the "no Safety Brick fitted"
 * case — with policy contributed by bricks, a bot with no safety brick has no
 * runtime to ask, which `collectGuardrails`' own suite covers in core.
 */

function registry() {
	const built = createPackRegistry();
	built.registerPack(starterPack);
	return built;
}

type SafetyConfig = {
	maxTicks: number;
	blockedActions: string[];
	approvalMode: boolean;
	repeatLimit?: number;
	policyCards?: string[];
};

/** The rules a safety brick with this config installs, in the order it installs them. */
function guardrailsFor(safety: SafetyConfig) {
	const reg = registry();
	return collectGuardrails(
		buildRuntimes({
			spec: {
				id: '00000000-0000-4000-8000-000000000000',
				name: 'Testbot',
				schemaVersion: 2,
				bricks: [{ slot: 'safety', kind: 'starter/safety', configVersion: 1, config: safety }],
				goalCardId: 'starter/say-hello',
				identity: { displayName: 'Testbot', boxArtSeed: '' },
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z'
			},
			registry: reg,
			context: {
				random: () => 0,
				getPolicyCard: (id) => reg.getPolicyCard(id),
				getAction: (id) => reg.getAction(id)
			}
		})
	);
}

const ids = (safety: SafetyConfig) => guardrailsFor(safety).map((guardrail) => guardrail.id);

const dialledTo = (maxTicks: number): SafetyConfig => ({
	maxTicks,
	blockedActions: [],
	approvalMode: false
});

describe('the rules a fitted Safety Brick installs', () => {
	it('always installs the step budget', () => {
		expect(ids(dialledTo(12))).toStrictEqual([STEP_BUDGET_ID]);
	});

	it('installs the blocklist only when something is actually blocked', () => {
		expect(ids({ ...dialledTo(12), blockedActions: ['open'] })).toStrictEqual([
			STEP_BUDGET_ID,
			ACTION_BLOCKLIST_ID
		]);
	});

	it('installs approval mode when the toggle is on', () => {
		expect(ids({ ...dialledTo(12), approvalMode: true })).toStrictEqual([
			STEP_BUDGET_ID,
			APPROVAL_MODE_ID
		]);
	});

	it('leaves the loop-breaker off unless a limit is set', () => {
		// Nobody gets a policy they did not choose (08 §3).
		expect(ids(dialledTo(12))).not.toContain(NO_REPETITION_ID);
	});

	it('installs the loop-breaker when a limit is set', () => {
		expect(ids({ ...dialledTo(12), repeatLimit: 3 })).toStrictEqual([
			STEP_BUDGET_ID,
			NO_REPETITION_ID
		]);
	});

	it('puts the loop-breaker after the blocklist but before approval', () => {
		// A flat prohibition beats it; and there is no point asking a person to
		// approve the fourth identical attempt at something that is not working.
		expect(
			ids({ maxTicks: 12, blockedActions: ['open'], approvalMode: true, repeatLimit: 3 })
		).toStrictEqual([STEP_BUDGET_ID, ACTION_BLOCKLIST_ID, NO_REPETITION_ID, APPROVAL_MODE_ID]);
	});

	it('orders the blocklist ahead of approval mode', () => {
		// An action the builder already forbade should be refused outright, not
		// offered to a human as a choice they only appear to have.
		expect(ids({ maxTicks: 12, blockedActions: ['open'], approvalMode: true })).toStrictEqual([
			STEP_BUDGET_ID,
			ACTION_BLOCKLIST_ID,
			APPROVAL_MODE_ID
		]);
	});

	it('passes the dial through to the step budget it builds', () => {
		const [stepBudget] = guardrailsFor(dialledTo(7));
		expect(stepBudget?.description).toBe('Stops the run after 7 turns.');
	});

	/**
	 * Policy cards (`14-…` §4.6, WP22). They compile after the four dial-based
	 * rules — the built-ins are the base policy, cards layer on top of it —
	 * and an id nothing registered is silently skipped, the same answer
	 * `starter/tools`'s belt gives an unresolvable tool id: `validateConfig`
	 * has already warned the builder, so the run does not also refuse to start.
	 */
	it('installs nothing extra for a policy card id nothing registered', () => {
		expect(ids({ ...dialledTo(12), policyCards: ['nope'] })).toStrictEqual([STEP_BUDGET_ID]);
	});

	it('compiles a fitted policy card after the dial-based rules', () => {
		expect(ids({ ...dialledTo(12), policyCards: ['starter/policy/wrap-up-by-ten'] })).toStrictEqual(
			[STEP_BUDGET_ID, 'starter/policy/wrap-up-by-ten#rule-0']
		);
	});

	it('gives the compiled rule its policyCardId, so a fired card is traceable', () => {
		const [, cardRule] = guardrailsFor({
			...dialledTo(12),
			policyCards: ['starter/policy/wrap-up-by-ten']
		});
		expect(cardRule?.policyCardId).toBe('starter/policy/wrap-up-by-ten');
	});
});
