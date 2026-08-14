import {
	sectionsPromptStrategy,
	transcriptPromptStrategy,
	type ChatMessage,
	type PromptInput
} from '@craftabot/core';
import { mumbling, obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildSpec, runToCompletion } from './harness.js';

/**
 * **The realism mode, proved on real runs** (E7 / `12-…` D12, WP15).
 *
 * `ChatMessage` has carried `role:'tool'` and `toolCallId` since WP2 and
 * nothing ever wrote one: the model was handed a *description* of its history
 * in prose and never the conversation itself. `transcript-v1` is the strategy
 * that closes that, and the only thing that makes it more than a different
 * string format is **well-formedness** — a provider rejects a tool result that
 * answers no call, and an assistant call that nothing answers, with a 400.
 *
 * So the invariant is asserted over prompts a real session composed, tick by
 * tick, rather than over hand-built inputs. A hand-built transcript proves the
 * author can write a correct one; this proves the engine does, including on the
 * turns that are easy to get wrong — a refusal, and a tick the bot mumbled
 * through.
 */

/** The two directions of the protocol, checked together because either alone passes trivially. */
function assertWellFormed(messages: readonly ChatMessage[]): void {
	const announced = new Set<string>();
	const answered = new Set<string>();

	for (const message of messages) {
		for (const call of message.toolCalls ?? []) {
			expect(message.role, 'only an assistant turn may make a call').toBe('assistant');
			expect(announced.has(call.id), `duplicate tool call id ${call.id}`).toBe(false);
			announced.add(call.id);
		}

		if (message.role !== 'tool') continue;
		expect(message.toolCallId, 'a tool message must name the call it answers').toBeTruthy();
		const id = message.toolCallId as string;
		expect(announced.has(id), `tool result ${id} answers a call nobody made`).toBe(true);
		expect(answered.has(id), `tool call ${id} answered twice`).toBe(false);
		answered.add(id);
	}

	const dangling = [...announced].filter((id) => !answered.has(id));
	expect(dangling, 'every call must be answered before the next turn').toEqual([]);
}

const WALK_EAST = [
	{ say: 'Teddy must be east.', call: 'move', args: { direction: 'east' } },
	{ say: 'Still going.', call: 'move', args: { direction: 'east' } },
	{ say: 'Nearly there.', call: 'move', args: { direction: 'east' } },
	{ say: 'Hello time.', call: 'say', args: { text: 'Hello Teddy!' } }
];

function transcriptSpec(overrides: Parameters<typeof buildSpec>[0] = {}) {
	return buildSpec({
		...overrides,
		memory: { windowSize: 10, notebook: false, strategy: 'transcript' }
	});
}

describe('the transcript prompt strategy', () => {
	it('sends a real function-calling conversation, not a description of one', async () => {
		const run = await runToCompletion({
			script: obedient(WALK_EAST),
			spec: transcriptSpec()
		});

		// The last prompt has the most history in it, so it is the one that shows
		// the protocol rather than merely the opening system message.
		const composed = run.byType('prompt.composed');
		const last = composed.at(-1)?.payload as { messages: ChatMessage[] };

		expect(last.messages.some((message) => message.role === 'tool')).toBe(true);
		expect(last.messages.some((message) => (message.toolCalls?.length ?? 0) > 0)).toBe(true);

		// The arguments survive as arguments. `action`/`result` had already reduced
		// them to the prose "tried to move", which is why a transcript could not be
		// rebuilt from V1's memory at all.
		const call = last.messages.flatMap((message) => message.toolCalls ?? [])[0];
		expect(call?.arguments).toEqual({ direction: 'east' });
	});

	it('composes a well-formed sequence on every tick of a run', async () => {
		const run = await runToCompletion({
			script: obedient(WALK_EAST),
			spec: transcriptSpec()
		});

		const composed = run.byType('prompt.composed');
		expect(composed.length).toBeGreaterThan(1);
		for (const event of composed) {
			assertWellFormed((event.payload as { messages: ChatMessage[] }).messages);
		}
	});

	/**
	 * A guardrail stopping a call is where a naive transcript breaks: the model
	 * made the call, the world never saw it, and V1 recorded only the prose
	 * refusal. Rendering the refusal as the *tool result* is both well-formed and
	 * the pattern every real agent platform uses for a denied tool.
	 */
	it('answers a refused call with the refusal, rather than leaving it dangling', async () => {
		const run = await runToCompletion({
			script: obedient([
				{ say: 'A little dance first.', call: 'celebrate', args: {} },
				...WALK_EAST
			]),
			spec: transcriptSpec({
				safety: {
					maxTicks: 12,
					blockedActions: ['starter/playroom/celebrate'],
					approvalMode: false
				}
			})
		});

		const composed = run.byType('prompt.composed');
		for (const event of composed) {
			assertWellFormed((event.payload as { messages: ChatMessage[] }).messages);
		}

		const messages = composed.at(-1)?.payload as { messages: ChatMessage[] };
		const denial = messages.messages.find(
			(message) => message.role === 'tool' && message.name === 'celebrate'
		);
		expect(denial?.content).toMatch(/safety rule stopped you/i);
	});

	/** A tick the bot mumbled through has no call — and so must have no tool message. */
	it('stays well-formed when a turn produced no call at all', async () => {
		const run = await runToCompletion({
			script: mumbling(),
			spec: transcriptSpec(),
			maxTicks: 3
		});

		const composed = run.byType('prompt.composed');
		for (const event of composed) {
			const { messages } = event.payload as { messages: ChatMessage[] };
			assertWellFormed(messages);
			expect(messages.some((message) => message.role === 'tool')).toBe(false);
		}
	});

	/**
	 * The point of two strategies is that they differ in *form* and not in
	 * *knowledge*. If transcript mode told the bot something sections mode did
	 * not, a comparison between them would be measuring the wrong thing.
	 */
	it('tells the bot the same system message as the prose strategy does', async () => {
		const input: PromptInput = {
			brickSections: ['About you: chirpy.'],
			goalCard: {
				id: 'starter/say-hello',
				title: 'Say hello',
				goalText: 'Find Teddy and say hello.',
				worldId: 'starter/playroom',
				layoutId: 'starter/playroom/rug',
				successCondition: 'said-to:teddy',
				hints: [],
				teachesConcepts: []
			},
			observation: 'You are on the rug.',
			memoryWindow: [
				{
					tick: 1,
					observation: 'the rug',
					thought: 'east it is',
					action: 'tried to move',
					result: 'you moved east',
					call: { kind: 'action' as const, name: 'move', arguments: { direction: 'east' } }
				}
			],
			fittedBricks: ['a brain'],
			feedback: []
		};

		const prose = sectionsPromptStrategy.compose(input);
		const transcript = transcriptPromptStrategy.compose(input);

		expect(transcript[0]).toEqual(prose[0]);
		// …and both end on the same "Right now", which is the current turn and
		// belongs to neither strategy.
		expect(transcript.at(-1)).toEqual(prose.at(-1));
		// The middle is where they differ, and they must actually differ.
		expect(JSON.stringify(transcript)).not.toBe(JSON.stringify(prose));
	});
});
