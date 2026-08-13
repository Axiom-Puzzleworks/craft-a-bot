import { describe, expect, it } from 'vitest';
import { composePrompt, composeSystemMessage, estimateTokens } from './prompt.js';
import type { GoalCardDefinition } from '../schemas/pack-manifest.js';

/**
 * Prompt composition, and only that.
 *
 * `describeFittedBricks` moved to `pack-starter` at WP14 slice 3a: each brick
 * now describes itself, so what the phrases *are* is the starter pack's
 * business and testing it here would mean stubbing six kinds to assert strings
 * core no longer owns.
 */

const goalCard: GoalCardDefinition = {
	id: 'starter/say-hello',
	title: 'Say Hello!',
	goalText: 'Introduce yourself to Teddy.',
	worldId: 'starter/playroom',
	layoutId: 'greeting',
	successCondition: 'said-hello-near-teddy',
	hints: [],
	teachesConcepts: []
};

const PERSONALITY = 'About you: You are a cheerful little robot.';

function input(overrides: Partial<Parameters<typeof composePrompt>[0]> = {}) {
	return {
		brickSections: [PERSONALITY],
		goalCard,
		observation: 'You look around: nothing but rug.',
		memoryWindow: [],
		fittedBricks: ['a brain (LLM)'],
		feedback: [],
		...overrides
	};
}

describe('the system message (02-AGENT-MODEL.md §8)', () => {
	it('carries the preamble, personality, goal, parts, and response rules', () => {
		const message = composeSystemMessage(input());
		expect(message).toContain('small robot in a simulated playroom');
		expect(message).toContain('cheerful little robot');
		expect(message).toContain('Introduce yourself to Teddy.');
		expect(message).toContain('a brain (LLM)');
		expect(message).toContain('at most one tool or action');
		expect(message).toContain('celebrate');
	});

	it('has no personality line when no brick contributed one', () => {
		// The Brain brick returns no section for a blank personality; the prompt
		// simply never hears about it.
		expect(composeSystemMessage(input({ brickSections: [] }))).not.toContain('About you:');
	});

	it('keeps the bricks’ sections in the order they were given', () => {
		const message = composeSystemMessage(
			input({ brickSections: ['About you: Terse.', 'You are carrying a torch.'] })
		);
		expect(message.indexOf('Terse.')).toBeLessThan(message.indexOf('torch'));
		// And ahead of the goal, which is where a brick's own voice belongs.
		expect(message.indexOf('torch')).toBeLessThan(message.indexOf('Your goal:'));
	});
});

describe('composePrompt', () => {
	it('sends two messages when there is nothing remembered', () => {
		const messages = composePrompt(input());
		expect(messages.map((m) => m.role)).toEqual(['system', 'user']);
		expect(messages[1]?.content).toContain('Right now:');
	});

	it('inserts the memory section between system and observation, oldest first', () => {
		const messages = composePrompt(
			input({
				memoryWindow: [
					{ tick: 1, observation: 'a', thought: 'b' },
					{ tick: 2, observation: 'c', thought: 'd' }
				]
			})
		);
		expect(messages).toHaveLength(3);
		expect(messages[1]?.content).toContain('oldest first');
		expect(messages[1]?.content.indexOf('Tick 1')).toBeLessThan(
			messages[1]?.content.indexOf('Tick 2') ?? 0
		);
	});

	it('puts guardrail and world feedback ahead of the observation', () => {
		const messages = composePrompt(input({ feedback: ['a safety rule stopped you: no.'] }));
		const last = messages.at(-1)?.content ?? '';
		expect(last.indexOf('safety rule')).toBeLessThan(last.indexOf('nothing but rug'));
	});
});

describe('estimateTokens', () => {
	it('scales with the amount of text and is never negative', () => {
		const small = estimateTokens([{ role: 'user', content: 'hi' }]);
		const large = estimateTokens([{ role: 'user', content: 'hi'.repeat(500) }]);
		expect(small).toBeGreaterThan(0);
		expect(large).toBeGreaterThan(small);
	});

	it('is zero for no messages', () => {
		expect(estimateTokens([])).toBe(0);
	});
});

/** The minimum a prompt needs, for the cases below to vary one thing each. */
function baseInput() {
	return {
		brickSections: [],
		goalCard,
		observation: 'You look around: nothing but rug.',
		memoryWindow: [],
		fittedBricks: ['a brain (LLM)'],
		feedback: []
	};
}

/**
 * The notebook and the progress line, both added after a live run showed a bot
 * looping at the toy chest with neither available to it.
 */
describe('the notebook in the prompt', () => {
	it('is injected, not left behind a tool call', () => {
		// As a tool it was inert: a bot has to think to consult its notes, and a
		// bot stuck in a loop is not doing the new thing that breaks the loop.
		const messages = composePrompt({
			...baseInput(),
			notebookLines: ['the red key is in the top-left corner', 'the chest was locked']
		});

		const notebook = messages.find((message) => message.content.startsWith('Your notebook says'));
		expect(notebook?.content).toContain('the red key is in the top-left corner');
		expect(notebook?.content).toContain('the chest was locked');
	});

	it('adds no message at all when the notebook is empty', () => {
		const messages = composePrompt({ ...baseInput(), notebookLines: [] });
		expect(messages.some((message) => message.content.startsWith('Your notebook'))).toBe(false);
	});

	it('adds no message when there is no notebook', () => {
		const messages = composePrompt(baseInput());
		expect(messages.some((message) => message.content.startsWith('Your notebook'))).toBe(false);
	});
});

describe('the progress line', () => {
	it('rides with the current observation, not the history', () => {
		const messages = composePrompt({
			...baseInput(),
			progress: 'Blocks in the toy chest: 1 of 3.'
		});

		const now = messages.at(-1);
		expect(now?.content).toContain('Right now:');
		expect(now?.content).toContain('Blocks in the toy chest: 1 of 3.');
	});

	it('is simply absent for a world that cannot describe progress', () => {
		const messages = composePrompt(baseInput());
		expect(messages.at(-1)?.content).not.toContain('undefined');
	});
});
