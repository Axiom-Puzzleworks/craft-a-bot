import { toSpecV2, type AnyAgentSpec } from './schemas/agent-spec-v2.js';
import type { PackRegistry } from './pack-registry.js';
import type { BuildProblem } from './schemas/build-problem.js';
import { brainSlotSchema, memorySlotSchema, slotConfig } from './schemas/slot-contracts.js';
import { buildRuntimes, disposeRuntimes, type FittedRuntime } from './session/brick-runtimes.js';
import { validateSpecV2 } from './validate-spec-v2.js';
import type { BrickValidationContext, SlotId } from './types/brick.js';

/**
 * The build-problem catalogue (02-AGENT-MODEL.md §6). Only `missing-brain`,
 * `unknown-cartridge`, and `unknown-goal-card` block GO — everything else is
 * a non-blocking build-checks-ribbon explanation (03-UI-UX-DESIGN.md §4.4).
 *
 * > **Amended 2026-08-13 (WP14 slice 3d):** every check here is now generic, and
 * > the v1 window has left core entirely (and was deleted outright in WP15).
 * >
 * > It used to have two halves. `validateSpecV2` asked what core can ask about
 * > *any* brick; everything else asked the six questions core only knew to ask
 * > because v1 baked six bricks into its schema — does the LLM brick have a
 * > cartridge, do the tools brick's tools exist, are the sense brick's channels
 * > installed. A Planner brick from an expansion pack would have been silently
 * > unvalidated, which is `12-…` D11 in the validator.
 * >
 * > What replaced them is the observation that core already has a way to ask a
 * > brick what it offers: the brick *tells* it, through the same hooks the loop
 * > uses. So the validator builds the runtimes and checks what comes back —
 * > every id a brick offers must resolve against the registry, whichever brick
 * > offered it. A Radar brick opening `radar/sweep` on a machine without the
 * > pack gets the same warning the Sense brick would, and nobody wrote a line of
 * > code for it.
 * >
 * > The two exceptions are the two the loop itself makes: the cartridge and the
 * > notebook are read through *slot contracts*, because they are what core needs
 * > rather than what a brick contributes (`schemas/slot-contracts.ts`).
 */
export function validateSpec(input: AnyAgentSpec, registry: PackRegistry): BuildProblem[] {
	const spec = toSpecV2(input);
	const problems: BuildProblem[] = validateSpecV2(spec, registry);

	/*
	 * The bricks, live, so they can be asked what they offer.
	 *
	 * The same call the session makes, with the same result: a kind nothing
	 * registered, or a config that does not parse, produces no runtime — and
	 * both have already been reported above, so what is left to check here is
	 * only what a *working* brick asks for. Randomness is fixed because nothing
	 * built here is ever run; a brick that used it to decide what it offers
	 * would be offering something different every time the ribbon refreshed.
	 */
	const runtimes = buildRuntimes({ spec, registry, context: { random: () => 0 } });
	try {
		problems.push(...brainProblems(spec, registry));
		problems.push(...goalCardProblems(spec, registry));
		problems.push(...callProblems(spec, registry, runtimes));
		problems.push(...senseProblems(registry, runtimes));
		problems.push(...ownProblems(spec, registry));
	} finally {
		// Built only to be asked a question, so they are put away immediately.
		disposeRuntimes(runtimes);
	}

	return problems;
}

/**
 * The brain, through the slot contract the engine reads it by.
 *
 * Blocking in both directions, because a bot with no model to call cannot run
 * at all — but an empty socket and a cartridge you do not own need different
 * fixes, so they get different copy.
 */
function brainProblems(spec: AnyAgentSpec, registry: PackRegistry): BuildProblem[] {
	const brain = slotConfig(spec, registry, 'brain', brainSlotSchema);
	if (!brain) {
		/*
		 * "Nothing that answers the brain contract is fitted." That covers an
		 * empty socket and — deliberately — a brick in the brain socket that has
		 * no cartridge to name, which is a bot that equally cannot think. The
		 * generic half has already said the more precise thing about the second.
		 */
		return [
			{
				code: 'missing-brain',
				severity: 'blocking',
				slot: 'brain',
				message: 'Your bot needs a brain! Snap on an LLM brick.'
			}
		];
	}

	if (registry.getCartridge(brain.cartridgeId)) return [];

	return [
		{
			code: 'unknown-cartridge',
			severity: 'blocking',
			slot: 'brain',
			message:
				brain.cartridgeId === ''
					? 'Your brain brick has no model cartridge in it yet.'
					: `The model cartridge "${brain.cartridgeId}" isn't installed.`,
			details: { cartridgeId: brain.cartridgeId }
		}
	];
}

function goalCardProblems(
	spec: ReturnType<typeof toSpecV2>,
	registry: PackRegistry
): BuildProblem[] {
	if (registry.getGoalCard(spec.goalCardId)) return [];
	return [
		{
			code: 'unknown-goal-card',
			severity: 'blocking',
			message: `The Goal Card "${spec.goalCardId}" isn't installed.`,
			details: { goalCardId: spec.goalCardId }
		}
	];
}

/**
 * Everything the bricks offer the model, checked against what is installed.
 *
 * Per brick rather than in one pooled list, so the ribbon can say *which* brick
 * is asking for something that is not there — the difference between "a tool is
 * missing" and "your tool belt names a tool you have not got".
 */
function callProblems(
	spec: ReturnType<typeof toSpecV2>,
	registry: PackRegistry,
	runtimes: readonly FittedRuntime[]
): BuildProblem[] {
	const problems: BuildProblem[] = [];
	// Read once: whether a notebook exists is a property of the bot, not of the
	// brick that wants to write in one.
	const notebook = slotConfig(spec, registry, 'memory', memorySlotSchema)?.notebook ?? false;

	for (const fitted of runtimes) {
		const offered = fitted.runtime.contributeCalls?.();

		for (const toolId of offered?.toolIds ?? []) {
			const tool = registry.getTool(toolId);
			if (!tool) {
				problems.push(
					missing(fitted.slot, 'unknown-tool', `The tool "${toolId}" isn't installed.`, { toolId })
				);
				continue;
			}
			/*
			 * A tool that writes in a notebook, on a bot with no notebook. Core can
			 * ask this generically because `requiresNotebook` is declared on the
			 * *tool*, and the brick offering it has no way to know what is in the
			 * memory socket — which is exactly why it is checked here and not
			 * there.
			 */
			if (tool.requiresNotebook && !notebook) {
				problems.push(
					missing(
						fitted.slot,
						'tool-needs-notebook',
						`"${tool.name}" needs the Memory brick's notebook switched on.`,
						{ toolId }
					)
				);
			}
		}

		for (const actionId of offered?.actionIds ?? []) {
			if (!registry.getAction(actionId)) {
				problems.push(
					missing(fitted.slot, 'unknown-action', `The action "${actionId}" isn't installed.`, {
						actionId
					})
				);
			}
		}
	}

	return problems;
}

/** Every channel the bricks open, checked the same way. */
function senseProblems(registry: PackRegistry, runtimes: readonly FittedRuntime[]): BuildProblem[] {
	const problems: BuildProblem[] = [];
	for (const fitted of runtimes) {
		for (const channelId of fitted.runtime.contributeSenses?.() ?? []) {
			if (!registry.getSenseChannel(channelId)) {
				problems.push(
					missing(
						fitted.slot,
						'unknown-sense-channel',
						`The sense channel "${channelId}" isn't installed.`,
						{ channelId }
					)
				);
			}
		}
	}
	return problems;
}

/**
 * The fourth question, asked of the kind rather than answered by core.
 *
 * Some configs are well-formed and still wrong, in ways only their own kind can
 * see: a Safety Brick blocklist naming an action nobody installed parses
 * perfectly, and means nothing. Core cannot check that — it does not know what
 * a blocklist is — so it asks.
 *
 * Over the *fitted bricks* rather than the runtimes, because a brick that is
 * pure configuration has a config to be wrong about too.
 */
function ownProblems(spec: ReturnType<typeof toSpecV2>, registry: PackRegistry): BuildProblem[] {
	const context: BrickValidationContext = {
		hasTool: (id) => registry.getTool(id) !== undefined,
		hasAction: (id) => registry.getAction(id) !== undefined,
		hasSenseChannel: (id) => registry.getSenseChannel(id) !== undefined,
		hasCartridge: (id) => registry.getCartridge(id) !== undefined
	};

	const problems: BuildProblem[] = [];
	for (const brick of spec.bricks) {
		const kind = registry.getBrickKind(brick.kind);
		if (!kind?.validateConfig || kind.slot !== brick.slot) continue;

		// Only a config that parses: a brick already told it does not understand
		// its own settings should not then be asked to reason about them.
		const parsed = kind.configSchema.safeParse(brick.config);
		if (!parsed.success) continue;

		for (const problem of kind.validateConfig(parsed.data, context)) {
			problems.push({ ...problem, slot: brick.slot });
		}
	}
	return problems;
}

/** A brick naming content this workbench has not got. Never blocking: the bot runs, with less. */
function missing(
	slot: SlotId,
	code: BuildProblem['code'],
	message: string,
	details: Record<string, unknown>
): BuildProblem {
	return { code, severity: 'warning', slot, message, details };
}
