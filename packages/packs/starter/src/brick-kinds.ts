import {
	actionsBrickSchema,
	llmBrickSchema,
	memoryBrickSchema,
	safetyBrickSchemaV2,
	senseBrickSchema,
	toolsBrickSchema,
	type BrickKindDefinition
} from '@craftabot/core';
import {
	compilePolicyCard,
	createActionBlocklistGuardrail,
	createApprovalModeGuardrail,
	createNoRepetitionGuardrail,
	createStepBudgetGuardrail,
	createTokenBudgetGuardrail
} from '@craftabot/governance';
import { starterBricks } from './bricks.js';
import { qualifyPlayroomId } from './world/playroom.js';

/**
 * **The six V1 bricks, ported onto the open contract** (`14-…` §2, WP14).
 *
 * Each of these already existed twice over: as pure presentation data in
 * `bricks.ts`, and as a config shape hard-coded into `AgentSpec` in core. The
 * contract is what lets a pack own both halves — which is the difference
 * between "the box contains six bricks" and "the box contains six bricks *and
 * you can make a seventh*".
 *
 * The config schemas are the ones core already had, re-exported and attached to
 * their kind rather than redeclared: this slice is deliberately additive, so
 * the engine still reads the v1 spec and behaviour cannot change. The defaults
 * are the ones the workbench has been carrying in `BRICK_DEFAULTS`, brought
 * here so there is one answer to "what does a freshly-snapped brick do?".
 *
 * > **Amended 2026-08-13 (WP14 slice 3a):** the kinds now carry `describeFitted`
 * > and, where they have live behaviour, `createRuntime`. Both were previously
 * > `if` branches in core — `describeFittedBricks` knew all six bricks by name,
 * > and the loop read `spec.bricks.llm?.personality` directly. A seventh brick
 * > could join neither. The strings are moved verbatim, because slice 3's gate
 * > is that a golden trace stays byte-stable.
 */

/** The window sizes the Memory brick offers, spelled as the prompt says them. */
function describeMemory(config: { windowSize: number; notebook: boolean }): string {
	return config.notebook
		? `memory of your last ${config.windowSize} turns, and a notebook`
		: `memory of your last ${config.windowSize} turns`;
}

/** The presentation half, so the toy and real names are not written twice. */
function facesOf(id: string) {
	const brick = starterBricks.find((candidate) => candidate.id === id);
	if (!brick) throw new Error(`No brick presentation data for "${id}"`);
	return {
		name: brick.name,
		description: brick.description,
		realName: brick.realName,
		realExplanation: brick.realExplanation
	};
}

export const starterBrickKinds: BrickKindDefinition[] = [
	{
		id: 'starter/llm',
		slot: 'brain',
		...facesOf('starter/llm'),
		configSchema: llmBrickSchema,
		configVersion: 1,
		defaults: { cartridgeId: '', temperature: 0.7, maxTokens: 300, personality: '' },
		describeFitted: () => 'a brain (LLM)',
		/*
		 * The personality, and nothing else.
		 *
		 * The rest of this brick's config — cartridge, temperature, token budget —
		 * is not a *contribution*: it configures the call the engine makes rather
		 * than adding anything to the prompt. The brain is the one brick that
		 * drives the loop instead of contributing to it, so core reads those
		 * fields from the brick in the `brain` socket. Core knows a brain has a
		 * cartridge (it owns the slot families); it does not know which brain.
		 */
		createRuntime: (config: { personality: string }) => ({
			contributeContext: () =>
				config.personality.trim() === ''
					? {}
					: { sections: [`About you: ${config.personality.trim()}`] }
		})
	} as BrickKindDefinition,
	{
		id: 'starter/memory',
		slot: 'memory',
		...facesOf('starter/memory'),
		configSchema: memoryBrickSchema,
		configVersion: 1,
		defaults: { windowSize: 10, notebook: false },
		describeFitted: describeMemory
	} as BrickKindDefinition,
	{
		id: 'starter/tools',
		slot: 'equipment',
		...facesOf('starter/tools'),
		configSchema: toolsBrickSchema,
		configVersion: 1,
		defaults: { enabled: [] },
		// A belt with nothing on it is not worth telling the bot about.
		describeFitted: (config: { enabled: string[] }) =>
			config.enabled.length > 0 ? 'a tool belt' : '',
		/*
		 * The belt names what is on it; core resolves each id against the
		 * registry and dispatches it. A tool the workbench has not got, and a
		 * notebook tool with no notebook to write in, are dropped there rather
		 * than here — both are already build problems the ribbon has reported,
		 * and the brick has no way to know about the Memory brick anyway.
		 */
		createRuntime: (config: { enabled: string[] }) => ({
			contributeCalls: () => ({ toolIds: config.enabled })
		})
	} as BrickKindDefinition,
	{
		id: 'starter/sense',
		slot: 'perception',
		...facesOf('starter/sense'),
		configSchema: senseBrickSchema,
		configVersion: 1,
		defaults: { channels: [qualifyPlayroomId('sight'), qualifyPlayroomId('compass')] },
		describeFitted: (config: { channels: string[] }) =>
			config.channels.length > 0 ? 'senses' : '',
		/*
		 * Which channels the visor opens. What each one *shows* is the world's
		 * business — a brick that returned observations would be a second way of
		 * seeing alongside `WorldInstance.observe`.
		 */
		createRuntime: (config: { channels: string[] }) => ({
			contributeSenses: () => config.channels
		})
	} as BrickKindDefinition,
	{
		id: 'starter/actions',
		slot: 'mobility',
		...facesOf('starter/actions'),
		configSchema: actionsBrickSchema,
		configVersion: 1,
		defaults: {
			enabled: ['move', 'pick_up', 'put_down', 'give', 'open', 'say', 'celebrate'].map(
				qualifyPlayroomId
			)
		},
		describeFitted: (config: { enabled: string[] }) =>
			config.enabled.length > 0 ? 'hands and wheels' : '',
		/*
		 * Which of the world's actions this bot was built to perform.
		 *
		 * The distinction core keeps is between an action the world *has* and one
		 * this bot *can do*: the first gets "you have not been built with any way
		 * to do it", the second simply happens. Taking a capability away is what
		 * the checkboxes are for.
		 */
		createRuntime: (config: { enabled: string[] }) => ({
			contributeCalls: () => ({ actionIds: config.enabled })
		})
	} as BrickKindDefinition,
	{
		id: 'starter/safety',
		slot: 'safety',
		...facesOf('starter/safety'),
		configSchema: safetyBrickSchemaV2,
		configVersion: 2,
		/**
		 * v1 → v2 (`14-…` §4.6, WP24): the boolean `approvalMode` becomes the
		 * three-way `approval` dial, `true`/`false` mapping onto its two ends —
		 * `'risky'` is new ground nobody's old kit file could have meant. Every
		 * other field is untouched, so it is dropped in and picked back up
		 * unchanged rather than re-listed field by field.
		 */
		migrateConfig: {
			1: (raw) => {
				const { approvalMode, ...rest } = raw;
				return { ...rest, approval: approvalMode ? 'everything' : 'off' };
			}
		},
		defaults: {
			maxTicks: 30,
			blockedActions: [],
			approval: 'off',
			repeatLimit: 3,
			policyCards: []
		},
		describeFitted: (config: { policyCards?: string[] }) =>
			config.policyCards && config.policyCards.length > 0
				? `a safety brick watching over you, with ${config.policyCards.length} extra ${config.policyCards.length === 1 ? 'rule' : 'rules'} slotted in`
				: 'a safety brick watching over you',
		/*
		 * A blocklist naming an action nobody installed, or a policy card nobody
		 * shipped (WP14 slice 3d; policy cards added WP22).
		 *
		 * Core used to run the blocklist half of this check itself, by reading
		 * `spec.bricks.safety` — one of the six special cases only the six V1
		 * bricks could ever have. It cannot be generic, because neither field is
		 * something this brick *offers*: both are ids the brick refers to — one to
		 * forbid, one to install — and only this brick knows what either of them
		 * means.
		 *
		 * Both are warnings rather than blocking. The bot runs, and the rule
		 * simply never fires — worth saying out loud, because a safety setting
		 * that quietly does nothing is exactly the sort of thing a builder should
		 * be told about.
		 */
		validateConfig: (config: { blockedActions: string[]; policyCards?: string[] }, ctx) => [
			...config.blockedActions
				.filter((actionId) => !ctx.hasAction(actionId))
				.map((actionId) => ({
					code: 'unknown-blocked-action' as const,
					severity: 'warning' as const,
					message: `The blocklist names "${actionId}", which isn't an installed action.`,
					details: { actionId }
				})),
			...(config.policyCards ?? [])
				.filter((cardId) => !ctx.hasPolicyCard(cardId))
				.map((cardId) => ({
					code: 'unknown-policy-card' as const,
					severity: 'warning' as const,
					message: `The Safety Brick names policy card "${cardId}", which this workbench does not have.`,
					details: { policyCardId: cardId }
				}))
		],
		/*
		 * The brick's dials, become running rules (WP14 slice 3d).
		 *
		 * This was `guardrailsForSpec` in `@craftabot/governance`: a compiler that
		 * read `spec.bricks.safety` by name and so could only ever compile *this*
		 * brick. Policy now arrives the way tools and senses do — the brick names
		 * what it installs, and core collects it — which is what lets a Monitor
		 * brick contribute rules of its own without a core change.
		 *
		 * Governance still owns the rules themselves. The split is the one the
		 * whole contract runs on: governance ships the *mechanisms* (a step budget,
		 * a blocklist), this pack decides which of them *this brick* installs and
		 * how it is dialled. That is content, not mechanism (hard rule 4).
		 *
		 * Order is behaviour, not presentation, because the chain stops at the
		 * first non-allow verdict (`08-…` §2), and it is `guardrailsForSpec`'s
		 * order unchanged: blocklist before approval mode, so an action the builder
		 * has already forbidden is refused outright rather than put to a human as a
		 * decision they appear free to make. No-repetition sits between them —
		 * after the flat prohibitions, before anybody is asked to approve a fourth
		 * identical attempt at something that has plainly stopped working. Policy
		 * cards (WP22) compile last: the four dials are the base policy, and a
		 * card layers custom rules on top of it rather than ahead of it.
		 *
		 * A card id nothing registered is skipped, the same answer the belt gives
		 * an unresolvable tool id — `validateConfig` has already told the builder.
		 *
		 * > **Amended 2026-08-16 (WP24):** `maxTokens` joins `maxTicks` as a second
		 * > budget, checked right beside it — both are the platform-floor tier, not
		 * > policy a builder reasons about action by action. `approval: 'risky'`
		 * > needs to know an action's `riskTier` before it can decide whether to
		 * > pause, which `ctx.getAction` resolves — the runtime-context lookup this
		 * > WP added for exactly this, the same shape as `getPolicyCard`.
		 */
		createRuntime: (
			config: {
				maxTicks: number;
				maxTokens?: number;
				blockedActions: string[];
				approval: 'off' | 'everything' | 'risky';
				repeatLimit?: number;
				policyCards?: string[];
			},
			ctx
		) => ({
			contributeGuardrails: () => {
				const guardrails = [createStepBudgetGuardrail(config.maxTicks)];
				if (config.maxTokens !== undefined) {
					guardrails.push(createTokenBudgetGuardrail(config.maxTokens));
				}
				// An empty list would allow everything on every check; the trace is
				// easier to read without a rule that cannot possibly fire.
				if (config.blockedActions.length > 0) {
					guardrails.push(createActionBlocklistGuardrail(config.blockedActions));
				}
				if (config.repeatLimit !== undefined) {
					guardrails.push(createNoRepetitionGuardrail(config.repeatLimit));
				}
				if (config.approval === 'everything') {
					guardrails.push(createApprovalModeGuardrail('everything'));
				} else if (config.approval === 'risky') {
					guardrails.push(
						createApprovalModeGuardrail('risky', (name) => {
							const tier = ctx.getAction(name)?.riskTier ?? 'observe';
							return tier === 'reversible' || tier === 'irreversible';
						})
					);
				}
				for (const cardId of config.policyCards ?? []) {
					const card = ctx.getPolicyCard(cardId);
					if (card) guardrails.push(...compilePolicyCard(card));
				}
				return guardrails;
			}
		})
	} as BrickKindDefinition
];
