import { SLOT_CAPACITY, type AgentSpecV2, type PackRegistry } from '@craftabot/core';

/**
 * **Named safety stacks** (WP64, `56-LIVE-COUNTERPARTS.md` §4.4; `41-…`
 * §6.5.6: "presets in the Spec Lab's Safety stack — content again"). A
 * stack is a *shape* the Spec Lab writes into the safety socket the way the
 * autonomy dial writes into the Safety Brick: the desk's own cards on the
 * Safety Brick, a Monitor Judge per conduct evaluator noting every tick,
 * and the Watchbot — the Compliance Watchbot's chassis half, the same one
 * every desk campaign carries as its `compliance-watchbot` guard. The
 * chokepoint half (the breaker) is an episode's, not a solo bot's.
 *
 * What is "the desk's own" is read from the registry by the pack prefix of
 * the card's world (`fs-advice/the-desk` → `fs-advice/`): its policy cards,
 * its deterministic evaluators in shipped order. Nothing here is typed in.
 */
export const STACK_PRESETS = {
	'compliance-watchbot': {
		name: 'Compliance Watchbot',
		blurb:
			'The desk’s cards on the Safety Brick, a Monitor Judge per conduct evaluator noting every turn, and the Watchbot.'
	}
} as const;
export type StackPresetId = keyof typeof STACK_PRESETS;

const SAFETY_KIND = 'starter/safety';
const JUDGE_KIND = 'workshop/monitor-judge';
const WATCHBOT_KIND = 'monitor/watchbot';

/** What a preset would fit on this bot, or why it cannot: the desk's pack has no evaluators, or the bot plays in a room. */
export function complianceWatchbotFor(
	spec: AgentSpecV2,
	registry: PackRegistry
):
	| { ok: true; packId: string; policyCards: string[]; evaluatorIds: string[] }
	| { ok: false; reason: string } {
	const card = registry.getGoalCard(spec.goalCardId);
	const world = card ? registry.getWorld(card.worldId) : undefined;
	if (!card || !world) return { ok: false, reason: 'This bot’s card is not installed.' };
	if (world.view !== 'desk') {
		return {
			ok: false,
			reason: 'The Compliance Watchbot sits beside a desk; this bot plays in a room.'
		};
	}
	const packId = world.id.slice(0, world.id.indexOf('/'));
	const prefix = `${packId}/`;
	const evaluatorIds = registry
		.listEvaluators()
		.filter((evaluator) => evaluator.id.startsWith(prefix) && evaluator.kind === 'deterministic')
		.map((evaluator) => evaluator.id);
	if (evaluatorIds.length === 0) {
		return {
			ok: false,
			reason: `The ${packId} pack ships no deterministic evaluator to judge with.`
		};
	}
	const policyCards = registry
		.listPolicyCards()
		.filter((policyCard) => policyCard.id.startsWith(prefix))
		.map((policyCard) => policyCard.id);
	return { ok: true, packId, policyCards, evaluatorIds };
}

/**
 * The spec with the preset written into its safety socket: the Safety Brick
 * kept (its config, with the desk's cards) or fitted, then as many judges as
 * the socket has room for beside the Watchbot. `undefined` when the preset
 * cannot apply.
 */
export function applyStack(
	spec: AgentSpecV2,
	preset: StackPresetId,
	registry: PackRegistry
): AgentSpecV2 | undefined {
	if (preset !== 'compliance-watchbot') return undefined;
	const plan = complianceWatchbotFor(spec, registry);
	if (!plan.ok) return undefined;
	const safetyKind = registry.getBrickKind(SAFETY_KIND);
	const judgeKind = registry.getBrickKind(JUDGE_KIND);
	const watchbotKind = registry.getBrickKind(WATCHBOT_KIND);
	if (!safetyKind || !judgeKind || !watchbotKind) return undefined;

	const existing = spec.bricks.find(
		(brick) => brick.slot === 'safety' && brick.kind === SAFETY_KIND
	);
	const safety = {
		slot: 'safety' as const,
		kind: SAFETY_KIND,
		configVersion: existing?.configVersion ?? safetyKind.configVersion,
		config: {
			...((existing?.config as Record<string, unknown> | undefined) ??
				structuredClone(safetyKind.defaults as Record<string, unknown>)),
			policyCards: plan.policyCards
		}
	};
	const room = SLOT_CAPACITY.safety - 2;
	const judges = plan.evaluatorIds.slice(0, room).map((evaluatorId) => ({
		slot: 'safety' as const,
		kind: JUDGE_KIND,
		configVersion: judgeKind.configVersion,
		config: {
			...structuredClone(judgeKind.defaults as Record<string, unknown>),
			evaluatorId,
			evaluatorConfig: '{}',
			everyTicks: 1
		}
	}));
	const watchbot = {
		slot: 'safety' as const,
		kind: WATCHBOT_KIND,
		configVersion: watchbotKind.configVersion,
		config: {
			...structuredClone(watchbotKind.defaults as Record<string, unknown>),
			watchFor: ['monitor/going-in-circles', 'monitor/refusal-storm']
		}
	};
	const others = spec.bricks.filter((brick) => brick.slot !== 'safety');
	return { ...spec, bricks: [...others, safety, ...judges, watchbot] };
}

/** Which preset the fitted stack is, read from the bricks — never from a remembered pick. */
export function stackOf(spec: AgentSpecV2): StackPresetId | undefined {
	const kinds = spec.bricks.filter((brick) => brick.slot === 'safety').map((brick) => brick.kind);
	const judges = kinds.filter((kind) => kind === JUDGE_KIND).length;
	return kinds.includes(SAFETY_KIND) && kinds.includes(WATCHBOT_KIND) && judges > 0
		? 'compliance-watchbot'
		: undefined;
}
