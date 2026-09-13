import { z } from 'zod';
import {
	stampComponent,
	type ComponentDeps,
	type GuardPoint,
	type Guardrail,
	type GuardrailComponent,
	type PointKind
} from '@craftabot/core';
import { createActionBlocklistGuardrail } from '../guardrails/action-blocklist.js';
import { createApprovalModeGuardrail } from '../guardrails/approval-mode.js';
import { createNoRepetitionGuardrail } from '../guardrails/no-repetition.js';
import { createStepBudgetGuardrail } from '../guardrails/step-budget.js';
import { createTokenBudgetGuardrail } from '../guardrails/token-budget.js';

/**
 * **The `builtin` adapter** (WP94, `85-COMPONENTS.md` §5): the Safety
 * brick's five rules, each a component whose `compile` is the very factory
 * the brick calls, so a fitted brick's chain and a component's chain are the
 * same guardrails built the same way. The points are read off the factory's
 * own `hooks`, never typed twice.
 */
const FREE = { class: 'free', latency: 'none' } as const;

function pointsOf(guardrail: Guardrail): PointKind[] {
	return [...guardrail.hooks];
}

export const stepBudgetSchema = z.object({ maxTicks: z.number().int().positive() });
export const tokenBudgetSchema = z.object({ maxTokens: z.number().int().positive() });
export const actionBlocklistSchema = z.object({
	blockedActions: z.array(z.string().min(1)).min(1)
});
export const noRepetitionSchema = z.object({ repeatLimit: z.number().int().positive() });
export const approvalModeSchema = z.object({ mode: z.enum(['everything', 'risky']) });

export const STEP_BUDGET_COMPONENT_ID = 'governance/step-budget';
export const TOKEN_BUDGET_COMPONENT_ID = 'governance/token-budget';
export const ACTION_BLOCKLIST_COMPONENT_ID = 'governance/action-blocklist';
export const NO_REPETITION_COMPONENT_ID = 'governance/no-repetition';
export const APPROVAL_MODE_COMPONENT_ID = 'governance/approval-mode';

export const stepBudgetComponent: GuardrailComponent<z.infer<typeof stepBudgetSchema>> = {
	id: STEP_BUDGET_COMPONENT_ID,
	name: 'Step budget',
	description: 'Stops the run when the bot has used its allowance of turns.',
	technique: 'budget-cap',
	points: pointsOf(createStepBudgetGuardrail(1)),
	verdicts: ['allow', 'stop-run'],
	cost: FREE,
	configSchema: stepBudgetSchema,
	explain: (config) => `Stops the run after ${config.maxTicks} turns.`,
	compile: (config, _deps, point) =>
		stampComponent([createStepBudgetGuardrail(config.maxTicks)], STEP_BUDGET_COMPONENT_ID, point)
};

export const tokenBudgetComponent: GuardrailComponent<z.infer<typeof tokenBudgetSchema>> = {
	id: TOKEN_BUDGET_COMPONENT_ID,
	name: 'Token budget',
	description: 'Stops the run when the bot has spent its allowance of tokens.',
	technique: 'budget-cap',
	points: pointsOf(createTokenBudgetGuardrail(1)),
	verdicts: ['allow', 'stop-run'],
	cost: FREE,
	configSchema: tokenBudgetSchema,
	explain: (config) => `Stops the run after ${config.maxTokens} tokens.`,
	compile: (config, _deps, point) =>
		stampComponent([createTokenBudgetGuardrail(config.maxTokens)], TOKEN_BUDGET_COMPONENT_ID, point)
};

export const actionBlocklistComponent: GuardrailComponent<z.infer<typeof actionBlocklistSchema>> = {
	id: ACTION_BLOCKLIST_COMPONENT_ID,
	name: 'Action blocklist',
	description: 'Blocks the actions on the list; the bot may propose them and never do them.',
	technique: 'tool-allow-deny',
	points: pointsOf(createActionBlocklistGuardrail(['x'])),
	verdicts: ['allow', 'block-action'],
	cost: FREE,
	configSchema: actionBlocklistSchema,
	explain: (config) => `Blocks ${config.blockedActions.join(', ')}.`,
	compile: (config, _deps, point) =>
		stampComponent(
			[createActionBlocklistGuardrail(config.blockedActions)],
			ACTION_BLOCKLIST_COMPONENT_ID,
			point
		)
};

export const noRepetitionComponent: GuardrailComponent<z.infer<typeof noRepetitionSchema>> = {
	id: NO_REPETITION_COMPONENT_ID,
	name: 'Loop-breaker',
	description: 'Blocks the same non-progress move proposed too many times running.',
	technique: 'loop-detection',
	points: pointsOf(createNoRepetitionGuardrail(1)),
	verdicts: ['allow', 'block-action'],
	cost: FREE,
	configSchema: noRepetitionSchema,
	explain: (config) => `Blocks a move repeated more than ${config.repeatLimit} times running.`,
	compile: (config, deps, point) =>
		stampComponent(
			[
				createNoRepetitionGuardrail(config.repeatLimit, {
					isProgress: (name) => deps.getAction(name)?.progress === true
				})
			],
			NO_REPETITION_COMPONENT_ID,
			point
		)
};

export const approvalModeComponent: GuardrailComponent<z.infer<typeof approvalModeSchema>> = {
	id: APPROVAL_MODE_COMPONENT_ID,
	name: 'Approval mode',
	description: 'Pauses for a person before the bot acts — on everything, or on what is risky.',
	technique: 'risk-tiered-approval',
	points: pointsOf(createApprovalModeGuardrail('everything')),
	verdicts: ['allow', 'pause'],
	cost: FREE,
	configSchema: approvalModeSchema,
	explain: (config) =>
		config.mode === 'everything'
			? 'Asks a person before every change to the world.'
			: 'Asks a person before anything reversible or irreversible.',
	compile: (config, deps, point) =>
		stampComponent(
			[
				config.mode === 'everything'
					? createApprovalModeGuardrail('everything')
					: createApprovalModeGuardrail('risky', (name) => {
							const tier = deps.getAction(name)?.riskTier ?? 'observe';
							return tier === 'reversible' || tier === 'irreversible';
						})
			],
			APPROVAL_MODE_COMPONENT_ID,
			point
		)
};

/** The five, in the order the Safety brick installs them. */
export const builtinComponents: GuardrailComponent[] = [
	stepBudgetComponent as GuardrailComponent,
	tokenBudgetComponent as GuardrailComponent,
	actionBlocklistComponent as GuardrailComponent,
	noRepetitionComponent as GuardrailComponent,
	approvalModeComponent as GuardrailComponent
];

/**
 * The Safety brick's config as its components, in the brick's own order
 * (`85-…` §6): what the identity test translates a fit into, and what the
 * Studio shows for a fitted Safety brick.
 */
export function builtinFitsFor(config: {
	maxTicks: number;
	maxTokens?: number;
	blockedActions?: string[];
	approval?: 'off' | 'everything' | 'risky';
	repeatLimit?: number;
}): Array<{ id: string; config: unknown; point: GuardPoint }> {
	const fits: Array<{ id: string; config: unknown; point: GuardPoint }> = [
		{
			id: STEP_BUDGET_COMPONENT_ID,
			config: { maxTicks: config.maxTicks },
			point: { kind: 'pre-think' }
		}
	];
	if (config.maxTokens !== undefined)
		fits.push({
			id: TOKEN_BUDGET_COMPONENT_ID,
			config: { maxTokens: config.maxTokens },
			point: { kind: 'pre-think' }
		});
	if (config.blockedActions && config.blockedActions.length > 0)
		fits.push({
			id: ACTION_BLOCKLIST_COMPONENT_ID,
			config: { blockedActions: config.blockedActions },
			point: { kind: 'pre-act' }
		});
	if (config.repeatLimit !== undefined)
		fits.push({
			id: NO_REPETITION_COMPONENT_ID,
			config: { repeatLimit: config.repeatLimit },
			point: { kind: 'pre-act' }
		});
	if (config.approval === 'everything' || config.approval === 'risky')
		fits.push({
			id: APPROVAL_MODE_COMPONENT_ID,
			config: { mode: config.approval },
			point: { kind: 'pre-act' }
		});
	return fits;
}

/** A deps object with nothing behind it — for declaring points and explaining, never for a run. */
export const noDeps: ComponentDeps = {
	getPolicyCard: () => undefined,
	getGuardrailService: () => undefined,
	getEvaluator: () => undefined,
	getAction: () => undefined
};
