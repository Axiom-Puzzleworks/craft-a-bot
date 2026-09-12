import { describe, expect, it } from 'vitest';
import {
	createPackRegistry,
	type PackManifest,
	type PolicyCard,
	type StageSpec
} from '@craftabot/core';
import { builtinComponents, STEP_BUDGET_COMPONENT_ID } from './builtin.js';
import { POLICY_CARD_COMPONENT_ID, policyCardComponent } from './policy-card.js';
import { stageBoundaryGuardrails } from './stage-guards.js';

/**
 * A stage's boundary chain (WP95, `69-…` §10): `policyCards` is sugar for
 * `policy-card` components at `stage-in` and compiles to the same chain;
 * components compile at their own point only; a component that cannot
 * decide at a boundary is refused.
 */
const CARD: PolicyCard = {
	id: 'test/policy/no-move',
	title: 'No moving',
	description: 'The bot stays put.',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: { kind: 'call-name-is', value: 'move' },
			then: 'block-action',
			reason: 'Stay put.'
		}
	]
};

const PACK: PackManifest = {
	id: 'test',
	name: 'Test',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	policyCards: [CARD],
	guardrailComponents: [...builtinComponents, policyCardComponent as never]
} as unknown as PackManifest;

function registry() {
	const created = createPackRegistry();
	created.registerPack(PACK);
	return created;
}

const stage = (guards: StageSpec['guards']): StageSpec => ({
	id: 'decide',
	name: 'Decide',
	input: { type: 'object' },
	output: { type: 'object' },
	executor: { kind: 'rule', rule: 'decide' },
	next: () => 'end',
	...(guards ? { guards } : {})
});

const shape = (chain: ReturnType<ReturnType<typeof stageBoundaryGuardrails>>) =>
	chain.map((guardrail) => ({
		id: guardrail.id,
		hooks: guardrail.hooks,
		componentId: guardrail.componentId,
		policyCardId: guardrail.policyCardId,
		point: guardrail.point
	}));

describe('stageBoundaryGuardrails (WP95)', () => {
	it('policyCards sugar compiles to the same chain as the component form, at stage-in only', () => {
		const compile = stageBoundaryGuardrails(registry());
		const sugar = compile(stage({ policyCards: [CARD.id] }), 'stage-in');
		const explicit = compile(
			stage({
				components: [
					{ id: POLICY_CARD_COMPONENT_ID, config: { cardId: CARD.id }, point: 'stage-in' }
				]
			}),
			'stage-in'
		);
		expect(shape(sugar)).toEqual(shape(explicit));
		expect(sugar).toHaveLength(1);
		expect(sugar[0]).toMatchObject({
			componentId: POLICY_CARD_COMPONENT_ID,
			policyCardId: CARD.id,
			point: { kind: 'stage-in', at: 'decide' }
		});
		expect(compile(stage({ policyCards: [CARD.id] }), 'stage-out')).toEqual([]);
	});

	it('cards come before components, each component at its own point', () => {
		const compile = stageBoundaryGuardrails(registry());
		const guarded = stage({
			policyCards: [CARD.id],
			components: [
				{ id: POLICY_CARD_COMPONENT_ID, config: { cardId: CARD.id }, point: 'stage-out' },
				{ id: POLICY_CARD_COMPONENT_ID, config: { cardId: CARD.id }, point: 'stage-in' }
			]
		});
		expect(compile(guarded, 'stage-in').map((guardrail) => guardrail.point?.kind)).toEqual([
			'stage-in',
			'stage-in'
		]);
		expect(compile(guarded, 'stage-out').map((guardrail) => guardrail.point?.kind)).toEqual([
			'stage-out'
		]);
		expect(compile(stage(undefined), 'stage-in')).toEqual([]);
	});

	it('refuses a component that cannot decide at a boundary', () => {
		const compile = stageBoundaryGuardrails(registry());
		expect(() =>
			compile(
				stage({
					components: [{ id: STEP_BUDGET_COMPONENT_ID, config: { maxTicks: 3 }, point: 'stage-in' }]
				}),
				'stage-in'
			)
		).toThrow(/cannot decide at stage-in/);
	});
});
