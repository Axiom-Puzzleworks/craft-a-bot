import type { AgentSpec } from './schemas/agent-spec.js';
import { asLegacySpec, type AnyAgentSpec } from './schemas/agent-spec-v2.js';
import type { PackRegistry } from './pack-registry.js';
import type { BuildProblem } from './schemas/build-problem.js';

/**
 * The build-problem catalogue (02-AGENT-MODEL.md §6). Only `missing-brain`,
 * `unknown-cartridge`, and `unknown-goal-card` block GO — everything else is
 * a non-blocking build-checks-ribbon explanation (03-UI-UX-DESIGN.md §4.4).
 */
export function validateSpec(input: AnyAgentSpec, registry: PackRegistry): BuildProblem[] {
	// Either shape (WP14 slice 2b); `validateSpecV2` is the generic half that
	// checks the bricks core cannot know about.
	const spec: AgentSpec = asLegacySpec(input);
	const problems: BuildProblem[] = [];

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
