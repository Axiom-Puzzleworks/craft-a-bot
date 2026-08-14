import { describe, expect, it } from 'vitest';
import {
	composePrompt,
	composeSystemMessage,
	estimateTokens,
	transcriptPromptStrategy
} from './prompt.js';
import type { TickMemory } from './memory.js';
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

	/**
	 * **The goal the child wrote** (`16-…` §2.5).
	 *
	 * Free Play is a laminated card with a marker pen. The text was captured on
	 * the spec from WP5, shown back on the card holder, and never put in the
	 * prompt — so for five work packages the bot pursued the card's generic
	 * wording and the child's actual goal reached nobody.
	 */
	it('prefers the goal its builder wrote over the one on the card', () => {
		const message = composeSystemMessage(
			input({ customGoalText: 'Push every block into a pile.' })
		);

		expect(message).toContain('Your goal: Push every block into a pile.');
		expect(message).not.toContain('Introduce yourself to Teddy.');
	});

	it('keeps the card’s goal when nothing was written', () => {
		expect(composeSystemMessage(input())).toContain('Your goal: Introduce yourself to Teddy.');
	});

	/** Tapping the box and typing a space is not setting a goal. */
	it('keeps the card’s goal when the writing is only whitespace', () => {
		const message = composeSystemMessage(input({ customGoalText: '   \n  ' }));

		expect(message).toContain('Your goal: Introduce yourself to Teddy.');
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

/**
 * **The transcript strategy's own unit charter** (E7, `12-…` D12).
 *
 * The invariant that matters — well-formedness across a whole run — is held in
 * `pack-starter`, where a real session can be driven. These are the cases below
 * that: the shape of one turn, and the two turns easiest to render wrongly.
 */
describe('the transcript prompt strategy', () => {
	/**
	 * Drop optional keys entirely rather than setting them to `undefined`.
	 * `exactOptionalPropertyTypes` treats those as different things, and so does
	 * the composer: "absent" is what an unperformed call actually looks like.
	 */
	const without = <K extends keyof TickMemory>(entry: TickMemory, ...keys: K[]): TickMemory => {
		const copy = { ...entry };
		for (const key of keys) delete copy[key];
		return copy;
	};

	const turn = (over: Partial<TickMemory> = {}): TickMemory => ({
		tick: 1,
		observation: 'you were on the rug',
		thought: 'east it is',
		action: 'tried to move',
		result: 'you moved east',
		call: { kind: 'action', name: 'move', arguments: { direction: 'east' } },
		...over
	});

	it('renders a remembered turn as user → assistant-with-call → tool', () => {
		const messages = transcriptPromptStrategy.compose(input({ memoryWindow: [turn()] }));

		expect(messages.map((message) => message.role)).toEqual([
			'system',
			'user',
			'assistant',
			'tool',
			'user'
		]);
		expect(messages[2]?.toolCalls).toEqual([
			{ id: 'call_1', name: 'move', arguments: { direction: 'east' } }
		]);
		expect(messages[3]).toMatchObject({
			toolCallId: 'call_1',
			name: 'move',
			content: 'you moved east'
		});
	});

	/** One call per turn is the V1 rule, so the tick names the call — no clock, no randomness. */
	it('gives each turn a deterministic call id', () => {
		const messages = transcriptPromptStrategy.compose(
			input({ memoryWindow: [turn({ tick: 3 }), turn({ tick: 7 })] })
		);

		expect(messages.flatMap((message) => message.toolCalls ?? []).map((call) => call.id)).toEqual([
			'call_3',
			'call_7'
		]);
		expect(
			JSON.stringify(transcriptPromptStrategy.compose(input({ memoryWindow: [turn()] })))
		).toBe(JSON.stringify(transcriptPromptStrategy.compose(input({ memoryWindow: [turn()] }))));
	});

	it('answers a refused call with the refusal, so nothing dangles', () => {
		// A call that never reached the world has no action and no result — only
		// the reason it was stopped.
		const refused = without(turn({ refused: 'a safety rule stopped you' }), 'action', 'result');

		const messages = transcriptPromptStrategy.compose(input({ memoryWindow: [refused] }));

		expect(messages[3]).toMatchObject({ role: 'tool', content: 'a safety rule stopped you' });
	});

	/**
	 * A call that neither ran nor was refused should not happen — but a `tool`
	 * message with empty content is a 400, so the fallback is a sentence rather
	 * than a silence.
	 */
	it('never emits an empty tool result', () => {
		const bare = without(turn(), 'result');
		const messages = transcriptPromptStrategy.compose(input({ memoryWindow: [bare] }));

		expect(messages[3]?.content).toBe('Nothing came back.');
	});

	it('emits no tool message for a turn that made no call, and never an empty assistant turn', () => {
		const mumbled: TickMemory = { tick: 2, observation: 'the rug', thought: '' };
		const messages = transcriptPromptStrategy.compose(input({ memoryWindow: [mumbled] }));

		expect(messages.map((message) => message.role)).toEqual([
			'system',
			'user',
			'assistant',
			'user'
		]);
		expect(messages[2]?.content).toBe('(no reply)');
	});

	it('carries the notebook, like the prose strategy does', () => {
		const messages = transcriptPromptStrategy.compose(
			input({ memoryWindow: [turn()], notebookLines: ['the red key opens the chest'] })
		);

		expect(messages.at(-2)?.content).toContain('the red key opens the chest');
	});
});
