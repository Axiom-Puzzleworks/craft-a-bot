import { migrateBrickConfig } from '../brick-config.js';
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

/**
 * **How a tick's messages are assembled** (E7, `14-…` §3).
 *
 * The counterpart to `MemoryStrategy`: that one decides what survives between
 * ticks, this one decides how it reads to the model. Two ship — `sections-v1`,
 * the labelled prose V1 has always sent, and `transcript-v1`, the real
 * function-calling protocol (`12-…` D12).
 *
 * Both are handed the same `PromptInput`. That is the point: swapping the
 * strategy changes nothing about what the agent *knows*, only about the form
 * it is told in, which is the comparison the Workshop exists to let a
 * professional make.
 */
export interface PromptStrategy {
	/** Stable id, recorded on `run.started` so a trace says how context was built. */
	readonly id: string;
	compose(input: PromptInput): ChatMessage[];
}

/**
 * V1's three labelled sections — system, memory, observation — exactly as
 * 03-UI-UX-DESIGN.md §5.2 promises the Flight Recorder will label them.
 *
 * The default for every kit build, and byte-for-byte what shipped before the
 * seam existed: the golden trace is the proof.
 */
export const sectionsPromptStrategy: PromptStrategy = {
	id: 'sections-v1',
	compose: composeSections
};

/** The default strategy's composer, kept as a named export since WP2. */
export function composePrompt(input: PromptInput): ChatMessage[] {
	return composeSections(input);
}

function composeSections(input: PromptInput): ChatMessage[] {
	const messages: ChatMessage[] = [{ role: 'system', content: composeSystemMessage(input) }];

	if (input.memoryWindow.length > 0) {
		messages.push({
			role: 'user',
			content: `What you remember of earlier turns, oldest first:\n${summariseWindow(input.memoryWindow)}`
		});
	}

	messages.push(...notebookMessages(input), rightNowMessage(input));

	return messages;
}

/**
 * **The real function-calling transcript** (`transcript-v1`, E7 / `12-…` D12).
 *
 * V1 hands the model a *description* of its own history in prose. Every
 * production agent framework hands it the conversation instead: the assistant
 * turn carrying the tool call it made, and a `tool` message answering that call
 * by id. `ChatMessage` has had `role:'tool'` and `toolCallId` since WP2 and
 * nothing ever wrote one.
 *
 * The prose form is the better teaching aid and stays the kit default — a child
 * reading the Flight Recorder can see "what you remember" as a paragraph. This
 * is the Workshop's realism mode, where the point is that the trace matches
 * what a professional will meet at work.
 *
 * **Well-formedness is the whole contract**, and it is not decorative: a
 * provider rejects a `tool` message that answers no call, and a dangling call
 * with no answer, with a 400. `transcript-strategy.test.ts` (in the starter
 * pack, where a whole run can be driven) holds the invariant in both
 * directions, over prompts a real session composed.
 */
export const transcriptPromptStrategy: PromptStrategy = {
	id: 'transcript-v1',
	compose: composeTranscript
};

function composeTranscript(input: PromptInput): ChatMessage[] {
	const messages: ChatMessage[] = [{ role: 'system', content: composeSystemMessage(input) }];

	for (const entry of input.memoryWindow) {
		messages.push({ role: 'user', content: `Turn ${entry.tick}. ${entry.observation}` });

		if (!entry.call) {
			// A turn the model mumbled through. No call means no `tool` message —
			// which is well-formed, and the honest record of a wasted tick.
			messages.push({ role: 'assistant', content: entry.thought || MUTE_TURN });
			continue;
		}

		const id = toolCallId(entry.tick);
		messages.push({
			role: 'assistant',
			content: entry.thought,
			toolCalls: [{ id, name: entry.call.name, arguments: entry.call.arguments }]
		});
		messages.push({
			role: 'tool',
			toolCallId: id,
			name: entry.call.name,
			// A refusal *is* the result. A guardrail or a person stopping a call is
			// the tool-denial pattern every real agent platform uses, and rendering
			// it as one teaches the mechanism rather than hiding it.
			content: entry.result ?? entry.refused ?? UNANSWERED
		});
	}

	messages.push(...notebookMessages(input), rightNowMessage(input));

	return messages;
}

/**
 * One call per turn is the V1 rule (`02-…` §5), so the tick number identifies
 * the call. Deterministic by construction — no ids from the clock, no
 * randomness (hard rule 5), and a trace stays byte-reproducible across replays.
 */
function toolCallId(tick: number): string {
	return `call_${tick}`;
}

/** Some providers reject an assistant turn that is neither speech nor a call. */
const MUTE_TURN = '(no reply)';
const UNANSWERED = 'Nothing came back.';

function notebookMessages(input: PromptInput): ChatMessage[] {
	if (!input.notebookLines || input.notebookLines.length === 0) return [];
	return [
		{
			role: 'user',
			content: `Your notebook says:\n${input.notebookLines.map((line) => `- ${line}`).join('\n')}`
		}
	];
}

/**
 * The current turn, shared by both strategies — because it is not history and
 * neither strategy has any business rendering *now* differently.
 *
 * Progress sits with the observation rather than the memory: it describes now,
 * and it is the line most likely to change the next decision.
 */
function rightNowMessage(input: PromptInput): ChatMessage {
	const observation = [...input.feedback, input.observation, input.progress ?? '']
		.filter((part) => part !== '')
		.join('\n');
	return { role: 'user', content: `Right now:\n${observation}` };
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
			const migrated = migrateBrickConfig(brick.config, brick.configVersion, kind);
			const config = kind.configSchema.safeParse(migrated);
			if (!config.success) continue;

			const described = kind.describeFitted?.(config.data) ?? kind.name;
			if (described.trim() !== '') fitted.push(described);
		}
	}
	return fitted.length > 0 ? fitted : ['nothing much, honestly'];
}

/**
 * V1's order, which is what this list has always been in.
 *
 * `'planner'` (WP30 stage A) is appended right after `brain` — brain-adjacent,
 * per `14-…` §5.1 — an insertion, not a reorder, so a bot built before this
 * stage describes itself exactly as it always has.
 *
 * `'reflexes'` (If/Then sizing, stage B) is appended right after `mobility` —
 * mobility-adjacent, per `14-…` §5.2 — the same insertion-not-reorder reasoning.
 */
const BRICK_ORDER = [
	'brain',
	'planner',
	'memory',
	'equipment',
	'perception',
	'mobility',
	'reflexes',
	'safety'
] as const;
