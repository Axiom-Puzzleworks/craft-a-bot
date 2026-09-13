import { describe, expect, it } from 'vitest';
import {
	buildRuntimes,
	collectGuardrails,
	createPackRegistry,
	validateSpec,
	type AgentSpecV2,
	type PackManifest,
	type Stack
} from '@craftabot/core';
import { compileStackLoop } from '@craftabot/governance';
import starterPack from './index.js';

/**
 * **The Safety brick's `stack`** (WP97, `89-STACKS.md` §5): a brick that
 * names a stack *is* the stack — it contributes the stack's loop components
 * in order and nothing of its own dials — so a stack of any size fits the
 * socket as one brick; a stack the workbench does not have is a warning at
 * validation and nothing at run time.
 */
const STACK: Stack = {
	schemaVersion: 1,
	id: 'test/stack/six',
	name: 'Six',
	description: 'Six components on the loop.',
	fit: [
		{
			componentId: 'governance/step-budget',
			config: { maxTicks: 4 },
			point: { kind: 'pre-think' }
		},
		{
			componentId: 'governance/token-budget',
			config: { maxTokens: 900 },
			point: { kind: 'pre-think' }
		},
		{
			componentId: 'governance/action-blocklist',
			config: { blockedActions: ['move'] },
			point: { kind: 'pre-act' }
		},
		{
			componentId: 'governance/no-repetition',
			config: { repeatLimit: 2 },
			point: { kind: 'pre-act' }
		},
		{
			componentId: 'governance/approval-mode',
			config: { mode: 'risky' },
			point: { kind: 'pre-act' }
		},
		{
			componentId: 'governance/policy-card',
			config: { cardId: 'starter/policy/no-loose-ends' },
			point: { kind: 'pre-act' }
		}
	],
	provenance: {
		author: { kind: 'person', id: 'tester', name: 'A. Tester' },
		createdAt: '2026-09-12T00:00:00Z'
	}
};
const STACK_PACK: PackManifest = {
	id: 'test',
	name: 'Test stacks',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	stacks: [STACK]
};

function registry() {
	const created = createPackRegistry();
	created.registerPack(starterPack);
	created.registerPack(STACK_PACK);
	return created;
}

function spec(config: Record<string, unknown>): AgentSpecV2 {
	return {
		id: '00000000-0000-4000-8000-000000000000',
		name: 'Testbot',
		schemaVersion: 2,
		bricks: [{ slot: 'safety', kind: 'starter/safety', configVersion: 2, config }],
		goalCardId: 'starter/say-hello',
		identity: { displayName: 'Testbot', boxArtSeed: '' },
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z'
	};
}

function guardrailsFor(config: Record<string, unknown>) {
	const reg = registry();
	return collectGuardrails(
		buildRuntimes({
			spec: spec(config),
			registry: reg,
			context: {
				random: () => 0,
				getPolicyCard: (id) => reg.getPolicyCard(id),
				getAction: (id) => reg.getAction(id),
				getGuardrailService: (id) => reg.getGuardrailService(id),
				getEvaluator: (id) => reg.getEvaluator(id),
				getStack: (id) => reg.getStack(id),
				getGuardrailComponent: (id) => reg.getGuardrailComponent(id),
				fetch: () => Promise.reject(new Error('fetch is not used in these tests')),
				getCredential: () => undefined
			}
		})
	);
}

describe('a Safety brick with a stack (WP97)', () => {
	it('contributes the stack’s six components as one brick, in order, and none of its own dials', () => {
		const chain = guardrailsFor({
			maxTicks: 30,
			blockedActions: ['say'],
			approval: 'everything',
			stack: STACK.id
		});
		const expected = compileStackLoop(STACK, registry());
		expect(chain.map((guardrail) => guardrail.id)).toEqual(
			expected.map((guardrail) => guardrail.id)
		);
		expect(chain).toHaveLength(6);
		expect(chain.every((guardrail) => guardrail.componentId !== undefined)).toBe(true);
		// The brick's own blocklist ('say') did not come along: the stack's ('move') did.
		const blocklist = chain.find(
			(guardrail) => guardrail.componentId === 'governance/action-blocklist'
		);
		expect(blocklist?.description).not.toContain('say');
	});

	it('without a stack the brick’s dials run as ever', () => {
		const chain = guardrailsFor({ maxTicks: 30, blockedActions: [], approval: 'off' });
		expect(chain.map((guardrail) => guardrail.componentId)).toEqual([undefined]);
	});

	it('a stack the workbench does not have is a warning at validation, and the brick runs its dials', () => {
		const reg = registry();
		const problems = validateSpec(
			spec({ maxTicks: 30, blockedActions: [], approval: 'off', stack: 'nobody/stack/x' }),
			reg
		);
		expect(problems.some((problem) => problem.code === 'unknown-stack')).toBe(true);
		const chain = guardrailsFor({
			maxTicks: 30,
			blockedActions: [],
			approval: 'off',
			stack: 'nobody/stack/x'
		});
		expect(chain).toHaveLength(1);
	});
});
