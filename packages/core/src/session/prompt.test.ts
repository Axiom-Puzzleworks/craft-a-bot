import { describe, expect, it } from 'vitest';
import {
	composePrompt,
	composeSystemMessage,
	describeFittedBricks,
	estimateTokens
} from './prompt.js';
import type { AgentSpec } from '../schemas/agent-spec.js';
import type { GoalCardDefinition } from '../schemas/pack-manifest.js';

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

function spec(bricks: Partial<AgentSpec['bricks']> = {}): AgentSpec {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Testbot',
		bricks,
		goalCardId: 'starter/say-hello',
		createdAt: '2026-08-12T09:00:00Z',
		updatedAt: '2026-08-12T09:00:00Z',
		schemaVersion: 1
	};
}

const llm = {
	cartridgeId: 'test/mock',
	temperature: 0,
	maxTokens: 256,
	personality: 'You are a cheerful little robot.'
};

function input(overrides: Partial<Parameters<typeof composePrompt>[0]> = {}) {
	return {
		spec: spec({ llm }),
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

	it('omits the personality line when the field is blank', () => {
		const message = composeSystemMessage(
			input({ spec: spec({ llm: { ...llm, personality: '  ' } }) })
		);
		expect(message).not.toContain('About you:');
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

describe('describeFittedBricks', () => {
	it('lists each fitted brick in kit language', () => {
		const fitted = describeFittedBricks(
			spec({
				llm,
				memory: { windowSize: 10, notebook: true },
				tools: { enabled: ['starter/calculator'] },
				sense: { channels: ['sight'] },
				actions: { enabled: ['move'] },
				safety: { maxTicks: 30, blockedActions: [], approvalMode: false }
			})
		);
		expect(fitted).toEqual([
			'a brain (LLM)',
			'memory of your last 10 turns, and a notebook',
			'a tool belt',
			'senses',
			'hands and wheels',
			'a safety brick watching over you'
		]);
	});

	it('mentions memory without a notebook when the notebook is off', () => {
		const fitted = describeFittedBricks(spec({ memory: { windowSize: 3, notebook: false } }));
		expect(fitted).toEqual(['memory of your last 3 turns']);
	});

	it('is honest about a bot built from nothing', () => {
		expect(describeFittedBricks(spec())).toEqual(['nothing much, honestly']);
	});

	it('ignores bricks that are fitted but switched entirely off', () => {
		const fitted = describeFittedBricks(
			spec({ tools: { enabled: [] }, sense: { channels: [] }, actions: { enabled: [] } })
		);
		expect(fitted).toEqual(['nothing much, honestly']);
	});
});

/** The minimum a prompt needs, for the cases below to vary one thing each. */
function baseInput() {
	return {
		spec: spec({ llm: { cartridgeId: 'c', temperature: 0, maxTokens: 10, personality: '' } }),
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
