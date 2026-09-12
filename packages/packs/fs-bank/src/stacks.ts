import type { PolicyCard, Stack, StackFit } from '@craftabot/core';

/**
 * **A desk's stacks as content** (WP97, `89-STACKS.md` §3): the four
 * guards every desk baseline carries — the cards, the cards with a local
 * classifier, the cards with a hosted guard, the Compliance Watchbot —
 * written as stacks, from the same values the baseline's bricks are built
 * from, in the order WP94's translation fits them (`85-…` §6): the Safety
 * brick's rules, a card once per hook its rules use, the Guard brick's
 * floor then its service once per hook it screens. The identity test in
 * `harness` holds a stack-guarded run to the brick-guarded one.
 */
export const STEP_BUDGET = 'governance/step-budget';
export const TOKEN_BUDGET = 'governance/token-budget';
export const ACTION_BLOCKLIST = 'governance/action-blocklist';
export const NO_REPETITION = 'governance/no-repetition';
export const APPROVAL_MODE = 'governance/approval-mode';
export const POLICY_CARD = 'governance/policy-card';

/** The three loop hooks, in the order every shipped classifier screens them. */
export const CLASSIFIER_HOOKS = ['pre-think', 'pre-act', 'post-act'] as const;

export interface DeskSafety {
	maxTicks: number;
	maxTokens?: number;
	blockedActions?: string[];
	approval?: 'off' | 'everything' | 'risky';
	repeatLimit?: number;
}

/** The Guard brick's screening as the desk baselines fit it (`56-…`): every hook noted, offline. */
export const DESK_SCREENING = {
	screenObservation: 'note',
	screenDecision: 'note',
	screenResult: 'note',
	perCategory: {},
	minConfidence: 'medium',
	onFailure: 'stop-run',
	timeoutMs: 3000,
	offline: true
} as const;

const AUTHOR = { kind: 'service' as const, id: 'craft-a-bot', name: 'Craft A Bot' };

function safetyFits(safety: DeskSafety): StackFit[] {
	const fits: StackFit[] = [
		{
			componentId: STEP_BUDGET,
			config: { maxTicks: safety.maxTicks },
			point: { kind: 'pre-think' }
		}
	];
	if (safety.maxTokens !== undefined)
		fits.push({
			componentId: TOKEN_BUDGET,
			config: { maxTokens: safety.maxTokens },
			point: { kind: 'pre-think' }
		});
	if (safety.blockedActions && safety.blockedActions.length > 0)
		fits.push({
			componentId: ACTION_BLOCKLIST,
			config: { blockedActions: safety.blockedActions },
			point: { kind: 'pre-act' }
		});
	if (safety.repeatLimit !== undefined)
		fits.push({
			componentId: NO_REPETITION,
			config: { repeatLimit: safety.repeatLimit },
			point: { kind: 'pre-act' }
		});
	if (safety.approval === 'everything' || safety.approval === 'risky')
		fits.push({
			componentId: APPROVAL_MODE,
			config: { mode: safety.approval },
			point: { kind: 'pre-act' }
		});
	return fits;
}

/** A card once per hook its rules use, in the order the rules first name them. */
function cardFits(cards: readonly PolicyCard[]): StackFit[] {
	return cards.flatMap((card) =>
		[...new Set(card.rules.map((rule) => rule.hook))].map((hook) => ({
			componentId: POLICY_CARD,
			config: { cardId: card.id },
			point: { kind: hook }
		}))
	);
}

/** The Guard brick's floor (its step budget) then the service once per hook, as the baseline's brick runs; unplugged, the floor alone. */
function serviceFits(
	serviceId: string,
	serviceConfig: unknown | undefined,
	maxTicks = 30
): StackFit[] {
	const floor: StackFit = {
		componentId: STEP_BUDGET,
		config: { maxTicks },
		point: { kind: 'pre-think' }
	};
	if (serviceConfig === undefined) return [floor];
	return [
		floor,
		...CLASSIFIER_HOOKS.map((hook) => ({
			componentId: serviceId,
			config: { serviceConfig, screening: DESK_SCREENING, idPrefix: 'workshop/guard' },
			point: { kind: hook }
		}))
	];
}

export interface DeskStacksOptions {
	/** The pack the stacks belong to — the id prefix. */
	packId: string;
	/** The desk's name, for the stacks' names. */
	deskName: string;
	/** The Safety brick's config as the baseline fits it. */
	safety: DeskSafety;
	/** The cards the baseline's Safety brick names, as objects (their rules' hooks decide the fits). */
	cards: readonly PolicyCard[];
	/** The classifier the `+local-classifier` guard fits; absent, no such stack. */
	localClassifier?: string;
	/**
	 * The hosted guard the `+hosted-guard` guard fits; absent, no such stack.
	 * With no `hostedGuardConfig` the service is *unplugged* — the desk
	 * baselines fit it with `serviceConfig: '{}'`, which the service refuses,
	 * so the Guard brick runs its floor alone (`29-…` §4.6) — and the stack
	 * says so: the floor, and no service fit (`89-…` §8).
	 */
	hostedGuard?: string;
	/** The service's own config when the stack should really screen (offline through the stand-in). */
	hostedGuardConfig?: unknown;
	/** The Compliance Watchbot's chokepoint half; absent, no such stack. */
	watchbot?: {
		watchFor: string[];
		breakOn: Array<{ evaluatorId: string; labels?: string[]; onFail?: boolean }>;
	};
	/** What the stacks claim to serve — the desk's obligation tags and control rows. */
	obligations?: string[];
	controls?: string[];
	createdAt?: string;
}

/** The desk's stacks, ids `{packId}/stack/{guardId}` so a campaign guard names one by its own id. */
export function deskStacks(options: DeskStacksOptions): Stack[] {
	const createdAt = options.createdAt ?? '2026-09-12T00:00:00Z';
	const claims = {
		...(options.obligations ? { obligations: [...options.obligations] } : {}),
		...(options.controls ? { controls: [...options.controls] } : {})
	};
	const base = [...safetyFits(options.safety), ...cardFits(options.cards)];
	const stack = (
		guardId: string,
		name: string,
		description: string,
		fit: StackFit[],
		group?: Stack['group']
	): Stack => ({
		schemaVersion: 1,
		id: `${options.packId}/stack/${guardId}`,
		name,
		description,
		fit,
		...(group ? { group } : {}),
		...claims,
		provenance: { author: AUTHOR, createdAt }
	});
	const stacks: Stack[] = [
		stack(
			'policy-cards',
			`${options.deskName}: the cards`,
			'The Safety brick’s rules and the desk’s policy cards, on the loop.',
			base
		)
	];
	if (options.localClassifier)
		stacks.push(
			stack(
				'policy-cards+local-classifier',
				`${options.deskName}: the cards with a local classifier`,
				'The cards, then a local classifier screening every hook offline.',
				[...base, ...serviceFits(options.localClassifier, {})]
			)
		);
	if (options.hostedGuard)
		stacks.push(
			stack(
				'policy-cards+hosted-guard',
				`${options.deskName}: the cards with a hosted guard`,
				options.hostedGuardConfig === undefined
					? 'The cards, then a hosted guard fitted unplugged — the Guard brick’s floor alone, as the baseline runs it.'
					: 'The cards, then a hosted guard screening every hook through its stand-in.',
				[...base, ...serviceFits(options.hostedGuard, options.hostedGuardConfig)]
			)
		);
	if (options.watchbot)
		stacks.push(
			stack(
				'compliance-watchbot',
				`${options.deskName}: the Compliance Watchbot`,
				'The cards on the loop; at the chokepoint, the group Watchbot and the evaluator breaker.',
				base,
				{
					watchFor: [...options.watchbot.watchFor],
					breakOn: options.watchbot.breakOn.map((entry) => ({ ...entry }))
				}
			)
		);
	return stacks;
}
