import { SLOT_CAPACITY, type AgentSpecV2, type PackRegistry, type Stack } from '@craftabot/core';

/**
 * **Named stacks** (WP64, `56-LIVE-COUNTERPARTS.md` §4.4; WP97, `89-STACKS.md`
 * §5): a stack is content — a pack ships it, the content store keeps a
 * user's — and this module only *reads* the registry: which stacks belong
 * to the desk a bot plays on, how a stack is written into the safety
 * socket, and which stack a fitted bot carries. The Safety brick with a
 * `stack` *is* the stack (one brick, however many components); a stack with
 * a chokepoint half also fits the Compliance Watchbot's chassis — a Monitor
 * Judge per conduct evaluator up to the socket's room, and the Watchbot —
 * as WP64 laid it out, so a solo bot on the desk is judged the way an
 * episode is.
 */
const SAFETY_KIND = 'starter/safety';
const JUDGE_KIND = 'workshop/monitor-judge';
const WATCHBOT_KIND = 'monitor/watchbot';

/** The stacks a bot may fit, or why none: the desk's pack's stacks and any local ones. */
export function stacksFor(
	spec: AgentSpecV2,
	registry: PackRegistry
):
	| { ok: true; packId: string; stacks: Stack[]; evaluatorIds: string[] }
	| { ok: false; reason: string } {
	const card = registry.getGoalCard(spec.goalCardId);
	const world = card ? registry.getWorld(card.worldId) : undefined;
	if (!card || !world) return { ok: false, reason: 'This bot’s card is not installed.' };
	if (world.view !== 'desk') {
		return { ok: false, reason: 'A named stack sits beside a desk; this bot plays in a room.' };
	}
	const packId = world.id.slice(0, world.id.indexOf('/'));
	const prefix = `${packId}/`;
	const stacks = registry
		.listStacks()
		.filter((stack) => stack.id.startsWith(prefix) || stack.id.startsWith('local/'));
	if (stacks.length === 0) {
		return { ok: false, reason: `The ${packId} pack ships no stack for this desk.` };
	}
	const evaluatorIds = registry
		.listEvaluators()
		.filter((evaluator) => evaluator.id.startsWith(prefix) && evaluator.kind === 'deterministic')
		.map((evaluator) => evaluator.id);
	return { ok: true, packId, stacks, evaluatorIds };
}

/** What the Compliance Watchbot preset would fit — kept for its readers (WP64): the desk's cards and judges. */
export function complianceWatchbotFor(
	spec: AgentSpecV2,
	registry: PackRegistry
):
	| { ok: true; packId: string; policyCards: string[]; evaluatorIds: string[] }
	| { ok: false; reason: string } {
	const plan = stacksFor(spec, registry);
	if (!plan.ok) return plan;
	if (plan.evaluatorIds.length === 0) {
		return {
			ok: false,
			reason: `The ${plan.packId} pack ships no deterministic evaluator to judge with.`
		};
	}
	const policyCards = registry
		.listPolicyCards()
		.filter((policyCard) => policyCard.id.startsWith(`${plan.packId}/`))
		.map((policyCard) => policyCard.id);
	return { ok: true, packId: plan.packId, policyCards, evaluatorIds: plan.evaluatorIds };
}

/**
 * The spec with the stack written into its safety socket: the Safety Brick
 * kept (its config) or fitted, with the stack on it; for a stack with a
 * chokepoint half, as many judges as the socket has room for beside the
 * Watchbot. `undefined` when the stack cannot apply.
 */
export function applyStack(
	spec: AgentSpecV2,
	stackId: string,
	registry: PackRegistry
): AgentSpecV2 | undefined {
	const plan = stacksFor(spec, registry);
	if (!plan.ok) return undefined;
	const stack = plan.stacks.find((entry) => entry.id === stackId);
	const safetyKind = registry.getBrickKind(SAFETY_KIND);
	if (!stack || !safetyKind) return undefined;

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
			stack: stack.id
		}
	};
	const others = spec.bricks.filter((brick) => brick.slot !== 'safety');
	if (!stack.group) return { ...spec, bricks: [...others, safety] };

	const judgeKind = registry.getBrickKind(JUDGE_KIND);
	const watchbotKind = registry.getBrickKind(WATCHBOT_KIND);
	if (!judgeKind || !watchbotKind || plan.evaluatorIds.length === 0) return undefined;
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
			watchFor: [...stack.group.watchFor]
		}
	};
	return { ...spec, bricks: [...others, safety, ...judges, watchbot] };
}

/** Which stack the fitted Safety Brick carries, read from its config — never from a remembered pick. */
export function stackOf(spec: AgentSpecV2): string | undefined {
	const safety = spec.bricks.find((brick) => brick.slot === 'safety' && brick.kind === SAFETY_KIND);
	const stack = (safety?.config as { stack?: unknown } | undefined)?.stack;
	return typeof stack === 'string' ? stack : undefined;
}
