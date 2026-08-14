import type { PackRegistry } from '../pack-registry.js';
import { toSpecV2, type AnyAgentSpec } from '../schemas/agent-spec-v2.js';
import type { GoalCardDefinition } from '../schemas/pack-manifest.js';
import type { ChatMessage } from '../types/provider.js';
import { summariseWindow, type TickMemory } from './memory.js';

/**
 * Prompt composition (02-AGENT-MODEL.md §8). Three messages, in this order, so
 * the Flight Recorder can label them *system / memory / observation* exactly as
 * 03-UI-UX-DESIGN.md §5.2 promises the user it will.
 *
 * Tools and actions are NOT described here — they go through the provider's
 * native tool-calling API (`ChatRequest.tools`), because users should learn the
 * real mechanism rather than a prompt-stuffing imitation.
 */

const PREAMBLE =
	'You are a small robot in a simulated playroom. You take one turn at a time. ' +
	'On each turn you are told what you can sense, and you may think briefly and then ' +
	'take at most one action or use at most one tool.';

const RESPONSE_RULES = [
	'Think briefly — a sentence or two, out loud.',
	'Then call at most one tool or action. Never more than one per turn.',
	'Only use `celebrate` when the goal is genuinely finished. Claiming success early is worse than taking another turn.'
];

export interface PromptInput {
	/**
	 * What the fitted bricks add to the system message (WP14 slice 3a).
	 *
	 * Was `spec.bricks.llm?.personality`, read here by name. The prompt no
	 * longer knows what an LLM brick is: it is handed whatever the bricks
	 * contributed, in slot order, and joins it up.
	 */
	brickSections: string[];
	goalCard: GoalCardDefinition;
	/**
	 * The goal the *builder* wrote, when they wrote one (`16-…` §2.5).
	 *
	 * Free Play is a laminated card with a marker pen: the child writes what
	 * they want the bot to do. The text was captured, stored on the spec and
	 * shown back on the card holder — and never once put in the prompt, so the
	 * bot pursued the card's generic "potter about" wording and the child's
	 * actual goal was heard by nobody. The card is still what the trace records
	 * and what the success condition judges; this only changes what the bot is
	 * *told*.
	 */
	customGoalText?: string | undefined;
	observation: string;
	memoryWindow: TickMemory[];
	/** Fitted-brick summary for the system message. */
	fittedBricks: string[];
	/** Anything the world or a guardrail wants the agent told this turn. */
	feedback: string[];
	/**
	 * The notebook's contents, if the Memory brick has one.
	 *
	 * Injected rather than left behind `notebook_read`. As a tool it was inert:
	 * a bot has to *think* to consult its notes, and a bot stuck in a loop is by
	 * definition not doing the new thing that would break the loop. Observed
	 * over fourteen live turns with the notebook switched on, it was never read
	 * once. Writing stays a tool — deciding what is worth noting is the
	 * interesting part; remembering to look is not.
	 */
	notebookLines?: string[];
	/** One line on how far along the goal is, from the world (02 §4). */
	progress?: string;
}

/**
 * The written goal wins over the printed one, when there is a written one.
 *
 * Whitespace counts as nothing: a child who taps the marker-pen box and types
 * a space has not set a goal, and an all-blank "goal" would replace a perfectly
 * good card with silence.
 */
function goalOf(input: PromptInput): string {
	const written = input.customGoalText?.trim();
	return written !== undefined && written !== '' ? written : input.goalCard.goalText;
}

export function composeSystemMessage(input: PromptInput): string {
	const sections = [
		PREAMBLE,
		...input.brickSections,
		`Your goal: ${goalOf(input)}`,
		`Parts you have been built with: ${input.fittedBricks.join(', ')}.`,
		`How to reply:\n${RESPONSE_RULES.map((rule) => `- ${rule}`).join('\n')}`
	];
	return sections.filter((section) => section !== '').join('\n\n');
}

export function composePrompt(input: PromptInput): ChatMessage[] {
	const messages: ChatMessage[] = [{ role: 'system', content: composeSystemMessage(input) }];

	if (input.memoryWindow.length > 0) {
		messages.push({
			role: 'user',
			content: `What you remember of earlier turns, oldest first:\n${summariseWindow(input.memoryWindow)}`
		});
	}

	if (input.notebookLines && input.notebookLines.length > 0) {
		messages.push({
			role: 'user',
			content: `Your notebook says:\n${input.notebookLines.map((line) => `- ${line}`).join('\n')}`
		});
	}

	// Progress sits with the current observation rather than the history: it
	// describes now, and it is the line most likely to change the next decision.
	const observation = [...input.feedback, input.observation, input.progress ?? '']
		.filter((part) => part !== '')
		.join('\n');
	messages.push({ role: 'user', content: `Right now:\n${observation}` });

	return messages;
}

/**
 * A cheap, provider-agnostic token estimate for the budget meter and the
 * `prompt.composed` event. Deliberately rough — the real count comes back from
 * the provider in `usage`; this only needs to be steady enough to drive a
 * "battery level" and to be honest that it is an estimate.
 */
export function estimateTokens(messages: ChatMessage[]): number {
	const characters = messages.reduce((total, message) => total + message.content.length, 0);
	return Math.ceil(characters / 4);
}

/**
 * Human-readable list of what is bolted on, for the system message.
 *
 * Each brick describes itself (`BrickKindDefinition.describeFitted`); this only
 * puts them in slot order and supplies the line for a bare chassis. It used to
 * be six hard-coded `if`s, which is `12-…` D11 in the one place a user actually
 * reads the consequence: a seventh brick could be fitted, could act, and would
 * never appear in the list of what the bot was built with.
 */
export function describeFittedBricks(spec: AnyAgentSpec, registry: PackRegistry): string[] {
	const fitted: string[] = [];
	for (const slot of BRICK_ORDER) {
		for (const brick of toSpecV2(spec).bricks.filter((candidate) => candidate.slot === slot)) {
			const kind = registry.getBrickKind(brick.kind);
			if (!kind || kind.slot !== brick.slot) continue;
			const config = kind.configSchema.safeParse(brick.config);
			if (!config.success) continue;

			const described = kind.describeFitted?.(config.data) ?? kind.name;
			if (described.trim() !== '') fitted.push(described);
		}
	}
	return fitted.length > 0 ? fitted : ['nothing much, honestly'];
}

/** V1's order, which is what this list has always been in. */
const BRICK_ORDER = ['brain', 'memory', 'equipment', 'perception', 'mobility', 'safety'] as const;
