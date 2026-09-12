import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createPackRegistry, type GuardrailContext, type PackManifest } from '@craftabot/core';
import {
	ACTION_BLOCKLIST_COMPONENT_ID,
	APPROVAL_MODE_COMPONENT_ID,
	NO_REPETITION_COMPONENT_ID,
	STEP_BUDGET_COMPONENT_ID,
	TOKEN_BUDGET_COMPONENT_ID,
	builtinComponents,
	builtinFitsFor,
	noDeps
} from './builtin.js';
import { compileComponents, componentDepsFor } from './compile.js';
import { EGRESS_NONE_COMPONENT_ID, egressComponents, egressModeOf } from './egress.js';
import { guardServiceComponent } from './guard-service.js';
import { POLICY_CARD_COMPONENT_ID, policyCardComponent } from './policy-card.js';
import { createStepBudgetGuardrail } from '../guardrails/step-budget.js';
import { compilePolicyCard } from '../policy-compiler.js';
import type { GuardrailService, PolicyCard } from '@craftabot/core';

/**
 * The adapters (WP94, `85-COMPONENTS.md` §5): each component's `compile` is
 * the lane's own factory, stamped; `builtinFitsFor` gives the Safety brick's
 * order; the compiler refuses what it cannot fit; the deps come off a registry.
 */

const context = (hook: GuardrailContext['hook']): GuardrailContext => ({
	hook,
	tick: 1,
	spec: { id: 'probe', name: 'probe', goalCardId: '', schemaVersion: 1 } as never,
	usage: { ticks: 5, inputTokens: 0, outputTokens: 0 },
	worldState: {},
	history: []
});

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
		},
		{
			hook: 'pre-think',
			when: { kind: 'usage-at-least', field: 'ticks', value: 100 },
			then: 'stop-run',
			reason: 'Long enough.'
		}
	]
};

const safe = () => ({
	screen: () =>
		Promise.resolve({
			reading: { outcome: 'ok' as const, matched: false, findings: [] },
			record: { service: 'test/echo', endpoint: 'nowhere' }
		})
});

const SERVICE: GuardrailService = {
	id: 'test/echo',
	name: 'Echo',
	description: 'Answers safe.',
	hooks: ['pre-think', 'pre-act'],
	egress: [{ host: 'echo.example', purpose: 'the test', sends: ['prompt'] }],
	configSchema: z.object({}),
	create: safe,
	createOffline: safe
};

const PACK: PackManifest = {
	id: 'test',
	name: 'Test',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	policyCards: [CARD],
	guardrailServices: [SERVICE],
	guardrailComponents: [
		...builtinComponents,
		policyCardComponent as never,
		...egressComponents,
		guardServiceComponent(SERVICE, { wraps: 'test/echo' }) as never
	]
} as unknown as PackManifest;

function registry() {
	const created = createPackRegistry();
	created.registerPack(PACK);
	return created;
}

describe('the built-in adapters', () => {
	it('declare their points off the factories and compile to the same guardrail, stamped', async () => {
		const [step] = compileComponents(
			[{ id: STEP_BUDGET_COMPONENT_ID, config: { maxTicks: 3 } }],
			registry(),
			noDeps
		);
		const bare = createStepBudgetGuardrail(3);
		expect(step?.id).toBe(bare.id);
		expect(step?.hooks).toEqual(bare.hooks);
		expect(step?.componentId).toBe(STEP_BUDGET_COMPONENT_ID);
		expect(step?.point).toEqual({ kind: 'pre-think' });
		expect(await step?.check(context('pre-think'))).toEqual(await bare.check(context('pre-think')));
	});

	it('builtinFitsFor keeps the Safety brick’s order and drops what is off', () => {
		const fits = builtinFitsFor({
			maxTicks: 10,
			maxTokens: 500,
			blockedActions: ['move'],
			approval: 'risky',
			repeatLimit: 2
		});
		expect(fits.map((fit) => fit.id)).toEqual([
			STEP_BUDGET_COMPONENT_ID,
			TOKEN_BUDGET_COMPONENT_ID,
			ACTION_BLOCKLIST_COMPONENT_ID,
			NO_REPETITION_COMPONENT_ID,
			APPROVAL_MODE_COMPONENT_ID
		]);
		expect(
			builtinFitsFor({ maxTicks: 10, blockedActions: [], approval: 'off' }).map((fit) => fit.id)
		).toEqual([STEP_BUDGET_COMPONENT_ID]);
	});
});

describe('the policy-card, guard-service and egress adapters', () => {
	it('the policy card compiles as compilePolicyCard does, with the card on every guardrail', () => {
		const deps = componentDepsFor(registry());
		const chain = compileComponents(
			[{ id: POLICY_CARD_COMPONENT_ID, config: { cardId: CARD.id }, point: { kind: 'pre-act' } }],
			registry(),
			deps
		);
		// At pre-act: the card's pre-act rule alone, as compilePolicyCard names it.
		expect(chain.map((guardrail) => guardrail.id)).toEqual(
			compilePolicyCard(CARD)
				.filter((guardrail) => guardrail.hooks.includes('pre-act'))
				.map((guardrail) => guardrail.id)
		);
		expect(chain).toHaveLength(1);
		expect(chain.every((guardrail) => guardrail.policyCardId === CARD.id)).toBe(true);
		expect(chain.every((guardrail) => guardrail.componentId === POLICY_CARD_COMPONENT_ID)).toBe(
			true
		);
	});

	it('the service compiles through the shell with the Guard Brick’s prefix, offline by the fit or by the host', async () => {
		const chain = compileComponents(
			[
				{
					id: SERVICE.id,
					config: { screening: { offline: true, screenObservation: 'note' } },
					point: { kind: 'pre-think' }
				}
			],
			registry(),
			componentDepsFor(registry())
		);
		// The point's guardrail alone, under the Guard Brick's prefix.
		expect(chain.map((guardrail) => [guardrail.id.split(':')[0], guardrail.hooks])).toEqual([
			['workshop/guard', ['pre-think']]
		]);
		expect(chain[0]?.componentId).toBe(SERVICE.id);
		const verdict = await chain[0]?.check(context('pre-think'));
		expect(verdict).toMatchObject({ allow: true });
		const hostOffline = compileComponents(
			[{ id: SERVICE.id, point: { kind: 'pre-act' } }],
			registry(),
			componentDepsFor(registry(), { screening: { offline: true } })
		);
		expect(hostOffline.map((guardrail) => guardrail.hooks)).toEqual([['pre-act']]);
		expect(
			await hostOffline[0]?.check({
				...context('pre-act'),
				proposed: { kind: 'action', name: 'say', arguments: {} }
			})
		).toMatchObject({ allow: true });
	});

	it('the egress rules compile to nothing and name their mode', () => {
		expect(compileComponents([{ id: EGRESS_NONE_COMPONENT_ID }], registry(), noDeps)).toEqual([]);
		expect(egressModeOf(EGRESS_NONE_COMPONENT_ID)).toBe('none');
		expect(egressModeOf(STEP_BUDGET_COMPONENT_ID)).toBeUndefined();
	});
});

describe('compileComponents refuses', () => {
	it('an unknown component, a wrong point, and a refused config', () => {
		expect(() => compileComponents([{ id: 'nobody/nothing' }], registry(), noDeps)).toThrow(
			/no guardrail component 'nobody\/nothing'/
		);
		expect(() =>
			compileComponents(
				[{ id: STEP_BUDGET_COMPONENT_ID, config: { maxTicks: 1 }, point: { kind: 'egress' } }],
				registry(),
				noDeps
			)
		).toThrow(/cannot decide at egress/);
		expect(() =>
			compileComponents(
				[{ id: STEP_BUDGET_COMPONENT_ID, config: { maxTicks: 0 } }],
				registry(),
				noDeps
			)
		).toThrow(/refuses its config/);
	});
});
