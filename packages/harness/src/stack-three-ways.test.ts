import { describe, expect, it } from 'vitest';
import type { Stack, StageSpec } from '@craftabot/core';
import { compileStackLoop, stageBoundaryGuardrails, stacksForStage } from '@craftabot/governance';
import {
	campaignFor,
	componentChainFor,
	experimentSchema,
	resolveGuardStack
} from '@craftabot/evals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRegistry, defaultConfig } from './config.js';

/**
 * **One stack, three ways** (Phase X exit, `83-…` §14 item 2's chain half;
 * `89-STACKS.md` §4): a stack with a hosted service on its stand-in, a
 * bespoke card and a breaker at `stage-out` resolves through a campaign
 * guard, a workflow configuration and an experiment's guard level to the
 * same chain — the same guardrail ids in the same order on the loop, and the
 * same boundary chain at the stage.
 */
const ROOT = resolve(import.meta.dirname, '../../..');
const registry = createRegistry(defaultConfig());

const STACK: Stack = {
	schemaVersion: 1,
	id: 'three-ways-test/stack/three-ways',
	name: 'Three ways',
	description: 'A hosted service on its stand-in, a card, a breaker at stage-out.',
	fit: [
		{
			componentId: 'governance/step-budget',
			config: { maxTicks: 12 },
			point: { kind: 'pre-think' }
		},
		{
			componentId: 'governance/policy-card',
			config: { cardId: 'fs-lending/policy/no-decision-before-affordability' },
			point: { kind: 'pre-act' }
		},
		{
			componentId: 'geap/model-armor',
			config: {
				serviceConfig: {
					projectId: 'stand-in',
					location: 'europe-west2',
					templateId: 'stand-in',
					offlineFixture: 'sdp-deidentified'
				},
				screening: { offline: true, screenDecision: 'note' }
			},
			point: { kind: 'pre-act' }
		},
		{
			componentId: 'monitor/evaluator-breaker',
			config: { evaluatorId: 'fs-lending/decision-matches-rules', onFail: true },
			point: { kind: 'stage-out', at: 'decision' }
		}
	],
	provenance: {
		author: { kind: 'person', id: 'tester', name: 'A. Tester' },
		createdAt: '2026-09-12T00:00:00Z'
	}
};

function withStack() {
	const packs = [
		...defaultConfig().packs,
		{
			id: 'three-ways-test',
			name: 'Three ways',
			version: '1.0.0',
			requiresCore: '>=1.0.0',
			stacks: [STACK]
		}
	];
	return createRegistry({ packs });
}

const ids = (chain: readonly { id: string; componentId?: string }[]) =>
	chain.map((guardrail) => `${guardrail.componentId ?? '-'}:${guardrail.id}`);

describe('one stack, three ways', () => {
	const reg = withStack();
	const decision = { id: 'decision' } as StageSpec;

	it('a campaign guard, a configuration and an experiment level give the same loop chain', () => {
		// The configuration's way — what the Safety brick and a journey's stack run.
		const configuration = compileStackLoop(STACK, reg);
		// The campaign guard's way.
		const guard = resolveGuardStack({ id: 'three', fit: [], stack: STACK.id }, reg);
		const campaign = componentChainFor(guard, reg);
		// The experiment's way: a guard level naming the stack, resolved as a campaign guard is.
		const raw = JSON.parse(
			readFileSync(resolve(ROOT, 'experiments', 'fraud-stack.json'), 'utf8')
		) as Record<string, unknown>;
		const design = raw.design as Record<string, unknown>;
		const experiment = experimentSchema.parse({
			...raw,
			design: {
				...design,
				factors: [{ axis: 'guard', levels: ['none', STACK.id] }],
				baseline: { guard: 'none' }
			}
		});
		const level = campaignFor(experiment, { guard: STACK.id });
		const experimentChain = componentChainFor(resolveGuardStack(level.guards[0]!, reg), reg);

		expect(ids(configuration)).toEqual([
			'governance/step-budget:safety/step-budget',
			'governance/policy-card:fs-lending/policy/no-decision-before-affordability#rule-0',
			'governance/policy-card:fs-lending/policy/no-decision-before-affordability#rule-1',
			'geap/model-armor:workshop/guard:decision'
		]);
		expect(ids(campaign)).toEqual(ids(configuration));
		expect(ids(experimentChain)).toEqual(ids(configuration));
		expect(registry.getStack(STACK.id)).toBeUndefined();
	});

	it('the breaker sits at the decision stage’s boundary and nowhere else', () => {
		const boundary = stageBoundaryGuardrails(reg, undefined, (stage) =>
			stacksForStage(reg, { stack: STACK.id }, stage)
		);
		expect(ids(boundary(decision, 'stage-out'))).toEqual([
			'monitor/evaluator-breaker:monitor/evaluator-breaker:fs-lending/decision-matches-rules'
		]);
		expect(boundary(decision, 'stage-in')).toEqual([]);
		expect(boundary({ id: 'intake' } as StageSpec, 'stage-out')).toEqual([]);
	});
});
