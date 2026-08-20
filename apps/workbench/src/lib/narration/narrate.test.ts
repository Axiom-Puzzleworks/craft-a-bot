import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '@craftabot/core';
import { currentTick, narrate } from './narrate.js';

/**
 * **The story a child reads instead of the trace** (`16-…` §1.3).
 *
 * The acceptance criterion is "every tick renders 3–5 beats from events alone",
 * and both halves of that are tested here: the count, because a strip that
 * shows fourteen beats has not solved the reading-load problem it exists for,
 * and *from events alone*, because the strip and the trace must never be able
 * to disagree.
 */

let seq = 0;
function at<T extends EngineEvent['type']>(tick: number, type: T, payload: unknown): EngineEvent {
	seq += 1;
	return {
		id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
		runId: '11111111-1111-4111-8111-111111111111',
		agentId: '22222222-2222-4222-8222-222222222222',
		tick,
		timestamp: '2026-08-13T09:00:00.000Z',
		type,
		payload
	} as EngineEvent;
}

const saw = (tick: number, summary: string) =>
	at(tick, 'sense', {
		channels: ['sight'],
		observation: { channels: ['sight'], text: 'a long description of the room', summary }
	});
const thought = (tick: number, text: string) => at(tick, 'decision', { thought: text, call: null });
const did = (tick: number, name: string, narration: string) =>
	at(tick, 'action.performed', { name, arguments: {}, result: { ok: true, narration } });
const failed = (tick: number, name: string, narration: string) =>
	at(tick, 'action.performed', { name, arguments: {}, result: { ok: false, narration } });
const started = (tick: number) => at(tick, 'tick.started', {});
const composed = (tick: number) =>
	at(tick, 'prompt.composed', { messages: [], estimatedTokens: 0 });

/** An ordinary turn: looked, thought, moved. */
const ordinaryTurn = (tick: number) => [
	started(tick),
	saw(tick, 'You are by the door. Teddy is to the east.'),
	composed(tick),
	thought(tick, 'Teddy must be east of here.'),
	did(tick, 'starter/playroom/move', 'You roll one square east.')
];

describe('a turn, retold', () => {
	it('gives between three and five beats', () => {
		const [turn] = narrate(ordinaryTurn(1));
		expect(turn?.beats.length).toBeGreaterThanOrEqual(3);
		expect(turn?.beats.length).toBeLessThanOrEqual(5);
	});

	it('tells it in the order it happened: saw, thought, did', () => {
		const [turn] = narrate(ordinaryTurn(1));
		expect(turn?.beats.map((beat) => beat.kind)).toEqual(['saw', 'thought', 'did']);
	});

	it('gives every beat a picture, for a reader who is not reading yet', () => {
		const [turn] = narrate(ordinaryTurn(1));
		for (const beat of turn?.beats ?? []) expect(beat.icon).not.toBe('');
	});

	/**
	 * The strip is a *summary*. Everything the machinery does is in the trace and
	 * most of it is noise to a child — a strip that showed the composed prompt
	 * would have exactly the reading-load problem the strip exists to solve.
	 */
	it('leaves out the machinery a child does not need', () => {
		const [turn] = narrate([
			...ordinaryTurn(1),
			at(1, 'memory.updated', { windowSize: 10, entries: 1 })
		]);
		expect(turn?.beats.map((beat) => beat.kind)).not.toContain('thought-tokens');
		expect(turn?.beats).toHaveLength(3);
	});

	/**
	 * Found by looking at it in the running app, which no test was going to catch.
	 * The observation summary is written for the *memory window* — WP11 packed it
	 * with position and bearings so a bot could navigate from it — and it arrived
	 * on the strip as three semicolon-joined clauses truncated mid-word. Right in
	 * a prompt, hopeless for a five-year-old.
	 */
	it('takes only the first thing the world mentions', () => {
		const events = [
			saw(
				1,
				'at column 2, row 5 you could see nothing nearby; your hands were empty; big things: the toy chest to the north'
			)
		];
		const caption = narrate(events)[0]?.beats[0]?.caption ?? '';
		expect(caption).toBe('at column 2, row 5 you could see nothing nearby.');
		expect(caption).not.toContain(';');
	});

	/** The same look found "the she…." — an ellipsis is already an ending. */
	it('does not put a full stop after an ellipsis', () => {
		const long = `${'a very long observation '.repeat(20)}`;
		const caption = narrate([saw(1, long)])[0]?.beats[0]?.caption ?? '';
		expect(caption).toMatch(/…$/);
		expect(caption).not.toContain('….');
	});

	it('prefers the world’s one-line summary to its full description', () => {
		const [turn] = narrate(ordinaryTurn(1));
		const sawBeat = turn?.beats.find((beat) => beat.kind === 'saw');
		expect(sawBeat?.caption).toContain('Teddy is to the east');
		expect(sawBeat?.caption).not.toContain('a long description');
	});
});

describe('a turn that went wrong', () => {
	/**
	 * `16-…` §1.2: world refusals were "invisible unless buried in memory prose"
	 * — the single biggest "this toy is broken" impression. A refusal is the same
	 * event as a success with `ok: false`, so the strip can always show it.
	 */
	it('shows the refusal in the bot’s own words', () => {
		const events = [
			started(1),
			saw(1, 'The chest is here, and it is locked.'),
			thought(1, 'I will open the chest.'),
			failed(1, 'starter/playroom/open', 'The chest is locked tight.')
		];

		const [turn] = narrate(events);
		const refusal = turn?.beats.find((beat) => beat.kind === 'refused');
		expect(refusal?.caption).toBe('The chest is locked tight.');
		expect(refusal?.icon).toBe('😕');
	});

	it('tells a refusal apart from a success', () => {
		const [turn] = narrate([did(1, 'move', 'You roll east.'), failed(1, 'open', 'It is locked.')]);
		expect(turn?.beats.map((beat) => beat.kind)).toEqual(['did', 'refused']);
	});

	it('says when a safety rule stepped in', () => {
		const events = [
			at(1, 'guardrail.tripped', {
				guardrailId: 'safety/action-blocklist',
				hook: 'pre-act',
				reason: 'Opening the chest is not allowed today.',
				disposition: 'block-action'
			})
		];
		const beat = narrate(events)[0]?.beats[0];
		expect(beat?.kind).toBe('stopped');
		expect(beat?.caption).toContain('not allowed today');
	});

	it('says when it stopped to ask, and what you answered', () => {
		const events = [
			at(1, 'approval.requested', {
				proposed: { kind: 'action', name: 'open', arguments: {} },
				reason: 'A grown-up should check this first.'
			}),
			at(1, 'approval.resolved', { approved: false })
		];
		const beats = narrate(events)[0]?.beats ?? [];
		expect(beats.map((beat) => beat.kind)).toEqual(['asked', 'result']);
		expect(beats[1]?.caption).toBe('You said no.');
	});
});

describe('a whole run', () => {
	it('keeps the turns in order, one entry each', () => {
		const ticks = narrate([...ordinaryTurn(1), ...ordinaryTurn(2), ...ordinaryTurn(3)]);
		expect(ticks.map((entry) => entry.tick)).toEqual([1, 2, 3]);
	});

	it('finishes with how it ended', () => {
		const events = [
			...ordinaryTurn(1),
			at(1, 'run.finished', {
				outcome: 'SUCCESS',
				ticks: 1,
				usage: { inputTokens: 0, outputTokens: 0 }
			})
		];
		expect(currentTick(narrate(events))?.beats.at(-1)?.caption).toBe('It did it!');
	});

	it('puts what happened outside any turn in turn zero', () => {
		// Something said to the bot before it started, per E2's session input.
		const events = [at(0, 'input.delivered', { text: 'Find Teddy!' }), ...ordinaryTurn(1)];
		const ticks = narrate(events);
		expect(ticks[0]?.tick).toBe(0);
		expect(ticks[0]?.beats[0]?.kind).toBe('heard');
	});

	it('has nothing to say about a run that has not started', () => {
		expect(narrate([])).toEqual([]);
		expect(currentTick([])).toBeUndefined();
	});
});

describe('a duo run, named', () => {
	/**
	 * **WP31 stage C** (`24-…` §4.4): `actors` labels each beat with which
	 * robot it is about, for a merged trace where two robots' beats can land
	 * in the same tick. Every existing case above passes no `actors` and is
	 * asserted unchanged, per this stage's own gate.
	 */
	const ROBO = '33333333-3333-4333-8333-333333333333';
	const BOLT = '44444444-4444-4444-8444-444444444444';
	const actors = new Map([
		[ROBO, 'Robo'],
		[BOLT, 'Bolt']
	]);

	function forAgent(agentId: string, event: EngineEvent): EngineEvent {
		return { ...event, agentId };
	}

	it('leaves every beat unlabelled when no actors map is given', () => {
		const [turn] = narrate(ordinaryTurn(1));
		for (const beat of turn?.beats ?? []) expect(beat.actor).toBeUndefined();
	});

	it('labels each beat with the robot it came from, by name', () => {
		const events = [
			forAgent(ROBO, saw(1, 'Robo sees the blue block.')),
			forAgent(BOLT, saw(1, 'Bolt sees the chest.'))
		];
		const [turn] = narrate(events, actors);
		expect(turn?.beats.map((beat) => beat.actor)).toEqual(['Robo', 'Bolt']);
		// The captions themselves are untouched — no pronoun surgery on a
		// pack's own copy (`24-…` §4.4's amendment).
		expect(turn?.beats[0]?.caption).toBe('Robo sees the blue block.');
	});

	it('falls back to a plain noun for an id the map does not recognise', () => {
		const events = [forAgent('55555555-5555-4555-8555-555555555555', saw(1, 'Something moved.'))];
		const [turn] = narrate(events, actors);
		expect(turn?.beats[0]?.actor).toBe('A robot');
	});

	it('keeps a pack’s own second-person narration verbatim, even when named', () => {
		const [turn] = narrate([forAgent(ROBO, did(1, 'move', 'You roll one square north.'))], actors);
		expect(turn?.beats[0]?.caption).toBe('You roll one square north.');
		expect(turn?.beats[0]?.actor).toBe('Robo');
	});

	it('names which robot finished, and how', () => {
		const events = [
			forAgent(
				ROBO,
				at(1, 'run.finished', {
					outcome: 'SUCCESS',
					ticks: 1,
					usage: { inputTokens: 0, outputTokens: 0 }
				})
			)
		];
		const beat = currentTick(narrate(events, actors))?.beats.at(-1);
		expect(beat?.caption).toBe('It did it!');
		expect(beat?.actor).toBe('Robo');
	});
});

describe('every beat points back at the trace', () => {
	/**
	 * `16-…` §1.3: tapping "see more" opens the Flight Recorder *at that tick* —
	 * the bridge from the child's trace to the real one. That only works if a
	 * beat knows which event it came from.
	 */
	it('carries the index of the event it was made from', () => {
		const events = ordinaryTurn(1);
		const [turn] = narrate(events);
		for (const beat of turn?.beats ?? []) {
			expect(events[beat.eventIndex]).toBeDefined();
		}
		const sawBeat = turn?.beats.find((beat) => beat.kind === 'saw');
		expect(events[sawBeat?.eventIndex ?? -1]?.type).toBe('sense');
	});
});
