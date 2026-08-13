import type { AgentSpec } from './schemas/agent-spec.js';
import { asLegacySpec, toSpecV2, type AnyAgentSpec } from './schemas/agent-spec-v2.js';
import type { PackRegistry } from './pack-registry.js';
import type { BuildProblem } from './schemas/build-problem.js';
import { validateSpecV2 } from './validate-spec-v2.js';

/**
 * The build-problem catalogue (02-AGENT-MODEL.md §6). Only `missing-brain`,
 * `unknown-cartridge`, and `unknown-goal-card` block GO — everything else is
 * a non-blocking build-checks-ribbon explanation (03-UI-UX-DESIGN.md §4.4).
 *
 * Two halves since WP14. `validateSpecV2` asks the questions core can ask about
 * *any* brick — is the kind installed, does its config parse, is a socket
 * double-filled — and everything below asks the six questions core only knows
 * to ask because v1 baked the six bricks into its schema. The second half
 * shrinks as bricks take over their own validation; the first half is the one
 * that a seventh brick can ever be checked by.
 */
export function validateSpec(input: AnyAgentSpec, registry: PackRegistry): BuildProblem[] {
	const problems: BuildProblem[] = validateSpecV2(toSpecV2(input), registry);

	/*
	 * The v1 window (WP14 slice 2b's shim). Note that a brick the generic half
	 * just rejected is invisible here — `legacyBricks` only admits a config that
	 * parses — so a bad Safety brick reports `bad-brick-config` once, rather than
	 * that plus a confusing second opinion about its blocklist.
	 */
	const spec: AgentSpec = asLegacySpec(input);

	if (!spec.bricks.llm) {
		problems.push({
			code: 'missing-brain',
			severity: 'blocking',
			brick: 'llm',
			message: 'Your bot needs a brain! Snap on an LLM brick.'
		});
	} else if (!registry.getCartridge(spec.bricks.llm.cartridgeId)) {
		// An empty slot and a cartridge you don't own are both blocking, but they
		// need different fixes, so they get different copy.
		const cartridgeId = spec.bricks.llm.cartridgeId;
		problems.push({
			code: 'unknown-cartridge',
			severity: 'blocking',
			brick: 'llm',
			message:
				cartridgeId === ''
					? 'Your brain brick has no model cartridge in it yet.'
					: `The model cartridge "${cartridgeId}" isn't installed.`,
			details: { cartridgeId }
		});
	}

	if (!registry.getGoalCard(spec.goalCardId)) {
		problems.push({
			code: 'unknown-goal-card',
			severity: 'blocking',
			message: `The Goal Card "${spec.goalCardId}" isn't installed.`,
			details: { goalCardId: spec.goalCardId }
		});
	}

	for (const toolId of spec.bricks.tools?.enabled ?? []) {
		const tool = registry.getTool(toolId);
		if (!tool) {
			problems.push({
				code: 'unknown-tool',
				severity: 'warning',
				brick: 'tools',
				message: `The tool "${toolId}" isn't installed.`,
				details: { toolId }
			});
			continue;
		}
		if (tool.requiresNotebook && !(spec.bricks.memory?.notebook ?? false)) {
			problems.push({
				code: 'tool-needs-notebook',
				severity: 'warning',
				brick: 'tools',
				message: `"${tool.name}" needs the Memory brick's notebook switched on.`,
				details: { toolId }
			});
		}
	}

	for (const channelId of spec.bricks.sense?.channels ?? []) {
		if (!registry.getSenseChannel(channelId)) {
			problems.push({
				code: 'unknown-sense-channel',
				severity: 'warning',
				brick: 'sense',
				message: `The sense channel "${channelId}" isn't installed.`,
				details: { channelId }
			});
		}
	}

	for (const actionId of spec.bricks.actions?.enabled ?? []) {
		if (!registry.getAction(actionId)) {
			problems.push({
				code: 'unknown-action',
				severity: 'warning',
				brick: 'actions',
				message: `The action "${actionId}" isn't installed.`,
				details: { actionId }
			});
		}
	}

	for (const actionId of spec.bricks.safety?.blockedActions ?? []) {
		if (!registry.getAction(actionId)) {
			problems.push({
				code: 'unknown-blocked-action',
				severity: 'warning',
				brick: 'safety',
				message: `The blocklist names "${actionId}", which isn't an installed action.`,
				details: { actionId }
			});
		}
	}

	return problems;
}
