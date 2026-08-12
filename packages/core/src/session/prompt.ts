import type { AgentSpec } from '../schemas/agent-spec.js';
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
	spec: AgentSpec;
	goalCard: GoalCardDefinition;
	observation: string;
	memoryWindow: TickMemory[];
	/** Fitted-brick summary for the system message. */
	fittedBricks: string[];
	/** Anything the world or a guardrail wants the agent told this turn. */
	feedback: string[];
}

export function composeSystemMessage(input: PromptInput): string {
	const sections = [
		PREAMBLE,
		input.spec.bricks.llm?.personality.trim()
			? `About you: ${input.spec.bricks.llm.personality.trim()}`
			: '',
		`Your goal: ${input.goalCard.goalText}`,
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

	const observation = [...input.feedback, input.observation]
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

/** Human-readable list of what is bolted on, for the system message. */
export function describeFittedBricks(spec: AgentSpec): string[] {
	const fitted: string[] = [];
	if (spec.bricks.llm) fitted.push('a brain (LLM)');
	if (spec.bricks.memory) {
		fitted.push(
			spec.bricks.memory.notebook
				? `memory of your last ${spec.bricks.memory.windowSize} turns, and a notebook`
				: `memory of your last ${spec.bricks.memory.windowSize} turns`
		);
	}
	if (spec.bricks.tools?.enabled.length) fitted.push('a tool belt');
	if (spec.bricks.sense?.channels.length) fitted.push('senses');
	if (spec.bricks.actions?.enabled.length) fitted.push('hands and wheels');
	if (spec.bricks.safety) fitted.push('a safety brick watching over you');
	return fitted.length > 0 ? fitted : ['nothing much, honestly'];
}
