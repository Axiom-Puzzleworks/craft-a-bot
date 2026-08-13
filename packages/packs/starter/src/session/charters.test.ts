import type { ChatMessage } from '@craftabot/core';
import type { MockScript } from '@craftabot/core/testing';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildSpec, runToCompletion } from './harness.js';

/**
 * **Interaction charters** (`13-…` §5).
 *
 * The brick matrix next door proves every switch does something. These prove
 * the handful of places where two bricks *mean* something together — where the
 * behaviour is not in either brick but in the pair, and where a regression
 * would show up as "the bot got a bit worse" rather than as a failing
 * assertion about a switch.
 */

const lastUser = (messages: ChatMessage[]): string =>
	[...messages].reverse().find((message) => message.role === 'user')?.content ?? '';

const memorySection = (messages: ChatMessage[]): string =>
	messages.find((message) => message.content.startsWith('What you remember'))?.content ?? '';

/**
 * ## Memory × Sense
 *
 * The charter `13-…` §5 names first, and the reason WP11's E4 exists: sight
 * reaches one square, so anything the bot walked past is gone unless the
 * memory line said *where* it was. Before E4 the line was "you could see a
 * snack" — a fact with nothing actionable in it.
 *
 * The brain below is the test. It is given no coordinates, no layout and no
 * plan: it reads the bearing out of its own memory, reads its position out of
 * the compass, and walks back. If the summary ever stops carrying position and
 * direction, this brain cannot find anything and the charter fails.
 */
describe('Memory × Sense: a bot can go back to something it saw once', () => {
	const DIRECTIONS: Record<string, { x: number; y: number }> = {
		north: { x: 0, y: -1 },
		'north-east': { x: 1, y: -1 },
		east: { x: 1, y: 0 },
		'south-east': { x: 1, y: 1 },
		south: { x: 0, y: 1 },
		'south-west': { x: -1, y: 1 },
		west: { x: -1, y: 0 },
		'north-west': { x: -1, y: -1 }
	};

	/** Where the compass says the bot is standing, 0-based. */
	function positionNow(text: string): { x: number; y: number } | undefined {
		const match = /You are standing at column (\d+) of \d+, row (\d+) of \d+/.exec(text);
		if (!match) return undefined;
		return { x: Number(match[1]) - 1, y: Number(match[2]) - 1 };
	}

	/** Where the snack was, worked out from a remembered sighting alone. */
	function snackFromMemory(memory: string): { x: number; y: number } | undefined {
		for (const line of memory.split('\n')) {
			const seen = /at column (\d+), row (\d+) you could see (.*?)(?:; your hands|$)/.exec(line);
			if (!seen) continue;
			const from = { x: Number(seen[1]) - 1, y: Number(seen[2]) - 1 };
			const sighting =
				/a snack \(a biscuit in a bowl\) (?:to the ([a-z-]+)|right where you stood)/.exec(
					seen[3] ?? ''
				);
			if (!sighting) continue;
			const offset = sighting[1] ? DIRECTIONS[sighting[1]] : { x: 0, y: 0 };
			if (!offset) continue;
			return { x: from.x + offset.x, y: from.y + offset.y };
		}
		return undefined;
	}

	/**
	 * Walks east and north to find the table, then — once the snack is only a
	 * memory — navigates back to it. Every decision comes from the prompt text.
	 */
	function navigator(): MockScript {
		let bumped: string | undefined;
		return (request) => {
			const observation = lastUser(request.messages);
			const here = positionNow(observation);
			const target = snackFromMemory(memorySection(request.messages));

			if (here && target) {
				const dx = target.x - here.x;
				const dy = target.y - here.y;
				const within = Math.max(Math.abs(dx), Math.abs(dy)) <= 1;
				if (within) {
					return {
						text: 'That is where I saw it.',
						toolCall: { name: 'pick_up', arguments: { item: 'snack' } }
					};
				}
				// Prefer the axis we were not just blocked on — the table sits in
				// the way, and a bot that keeps shoving it never arrives.
				const horizontal = dx !== 0 ? (dx > 0 ? 'east' : 'west') : undefined;
				const vertical = dy !== 0 ? (dy > 0 ? 'south' : 'north') : undefined;
				const first = bumped === horizontal ? (vertical ?? horizontal) : (horizontal ?? vertical);
				bumped = observation.includes('bump gently') ? first : undefined;
				return {
					text: `Heading ${first}.`,
					toolCall: { name: 'move', arguments: { direction: first } }
				};
			}

			// Nothing remembered yet: sweep towards the middle of the room.
			const direction = (request.messages.length + (here?.x ?? 0)) % 2 === 0 ? 'east' : 'north';
			return { text: 'Looking about.', toolCall: { name: 'move', arguments: { direction } } };
		};
	}

	it('finds the snack again using the memory line and the compass, and nothing else', async () => {
		const run = await runToCompletion({
			script: navigator(),
			spec: buildSpec({ goalCardId: 'starter/snack', senses: ['sight', 'compass'] }),
			maxTicks: 30,
			stepLimit: 30
		});

		const pickedUp = run
			.byType('action.performed')
			.filter(
				(event) =>
					(event.payload as { name: string }).name === 'pick_up' &&
					(event.payload as { result: { ok: boolean } }).result.ok
			);

		expect(pickedUp.length, 'the bot never got the snack back').toBeGreaterThan(0);
	});

	it('has nothing to navigate by if the summary loses its bearings', async () => {
		// The counter-test: with no compass the bot cannot place itself, so the
		// same brain fails. This is what the pre-E4 world was like for *every*
		// remembered thing, and it is why the charter is worth its length.
		const run = await runToCompletion({
			script: navigator(),
			spec: buildSpec({ goalCardId: 'starter/snack', senses: ['sight'] }),
			maxTicks: 12,
			stepLimit: 12
		});

		expect(run.outcome).toBe('OUT_OF_STEPS');
	});
});

/**
 * ## Memory × Safety
 *
 * A refusal is not a result: it never reached the world. The Memory brick
 * records it separately so the next prompt says "refused — …", which is the
 * only reason a bot stops re-proposing something the Safety brick has already
 * blocked three times.
 */
describe('Memory × Safety: a blocked attempt is remembered as blocked', () => {
	const spec = () => {
		const built = buildSpec({ goalCardId: 'starter/tidy-the-blocks' });
		built.bricks.safety = { maxTicks: 6, blockedActions: ['open'], approvalMode: false };
		return built;
	};

	it('writes the refusal into the window, and the world never sees the call', async () => {
		const built = spec();
		const run = await runToCompletion({
			script: obedient([
				{ say: 'I will open the chest.', call: 'open', args: { container: 'toy-chest' } },
				{ say: 'Trying again.', call: 'open', args: { container: 'toy-chest' } }
			]),
			spec: built,
			maxTicks: 3
		});

		// Refused before the world, so there is no action.performed at all.
		expect(run.byType('action.performed')).toHaveLength(0);
		expect(run.byType('guardrail.tripped').length).toBeGreaterThan(0);

		const prompts = run.byType('prompt.composed');
		const second = (prompts[1]?.payload as { messages: ChatMessage[] } | undefined)?.messages ?? [];
		expect(memorySection(second)).toContain('refused');
		expect(lastUser(second)).toContain('a safety rule stopped you');
	});
});

/**
 * ## Brain × Safety
 *
 * The step budget is checked before thinking, so the last tick of a run starts
 * and then stops without paying for a completion. That off-by-one looks like a
 * bug in the gauge and is the opposite: it is the budget doing its job.
 */
describe('Brain × Safety: the last turn costs nothing', () => {
	it('starts N ticks but only thinks N−1 times when the dial ends the run', async () => {
		const built = buildSpec();
		built.bricks.safety = { maxTicks: 3, blockedActions: [], approvalMode: false };

		const run = await runToCompletion({
			script: () => ({
				text: 'East.',
				toolCall: { name: 'move', arguments: { direction: 'east' } }
			}),
			spec: built,
			stepLimit: 8
		});

		const ticks = run.byType('tick.started').length;
		const thinks = run.byType('think.started').length;

		expect(run.outcome).toBe('STOPPED_BY_GUARDRAIL');
		expect(thinks).toBe(ticks - 1);
	});
});

/**
 * ## All × Absence
 *
 * Every brick is optional, and a bot missing one is a designed teaching moment
 * rather than a broken build. The failure mode this guards against is a crash
 * — a child who takes a brick off and gets an error screen has learned nothing
 * except that the toy is fragile.
 */
describe('All × Absence: any one brick can be missing and the run still ends properly', () => {
	const OUTCOMES = ['SUCCESS', 'OUT_OF_STEPS', 'STOPPED_BY_USER', 'STOPPED_BY_GUARDRAIL'];

	const withoutBrick = [
		['memory', () => buildSpec({ memory: null })],
		['tools', () => buildSpec({ tools: [] })],
		['sense', () => buildSpec({ senses: [] })],
		['actions', () => buildSpec({ actions: [] })]
	] as const;

	it.each(withoutBrick)('without the %s brick', async (_name, makeSpec) => {
		const run = await runToCompletion({
			script: () => ({ text: 'Hello?', toolCall: { name: 'say', arguments: { text: 'Hello!' } } }),
			spec: makeSpec(),
			maxTicks: 4,
			stepLimit: 6
		});

		expect(OUTCOMES).toContain(run.outcome);
		expect(run.byType('run.finished')).toHaveLength(1);
	});

	it('without a brain at all, which is the one that cannot think', async () => {
		// No LLM brick: `validateSpec` blocks GO, but the session must still be
		// constructible and must still end tidily if something starts it.
		const run = await runToCompletion({
			script: () => ({ text: '', toolCall: null }),
			spec: buildSpec({ llm: false }),
			maxTicks: 2,
			stepLimit: 4
		});

		expect(OUTCOMES).toContain(run.outcome);
	});
});
