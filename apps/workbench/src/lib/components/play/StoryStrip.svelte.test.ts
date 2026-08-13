import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { EngineEvent } from '@craftabot/core';
import type { Narrator } from '$lib/narration/speech.js';
import StoryStrip from './StoryStrip.svelte';

/**
 * **The child's trace** (`16-…` §1.2, §1.3).
 *
 * Two claims worth holding down. A **refusal is visible** — §1.2 calls invisible
 * refusals "the single biggest 'this toy is broken' impression". And the strip
 * **is the play route's live region**, closing `12-…` D16, which left a
 * screen-reader user with a silent bot on this screen.
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
		observation: { channels: ['sight'], text: summary, summary }
	});
const thought = (tick: number, text: string) => at(tick, 'decision', { thought: text, call: null });
const did = (tick: number, narration: string) =>
	at(tick, 'action.performed', {
		name: 'starter/playroom/move',
		arguments: {},
		result: { ok: true, narration }
	});
const refused = (tick: number, narration: string) =>
	at(tick, 'action.performed', {
		name: 'starter/playroom/open',
		arguments: {},
		result: { ok: false, narration }
	});

const turn = (tick: number) => [
	saw(tick, 'Teddy is to the east.'),
	thought(tick, 'I will go east.'),
	did(tick, 'You roll one square east.')
];

function fakeNarrator(): Narrator & { said: string[] } {
	const said: string[] = [];
	return {
		said,
		available: true,
		say: (text: string) => void said.push(text),
		hush: vi.fn()
	};
}

describe('the strip tells the current turn', () => {
	it('shows a beat for each thing that happened', () => {
		render(StoryStrip, { props: { events: turn(1) } });
		expect(screen.getByTestId('beat-saw')).toBeInTheDocument();
		expect(screen.getByTestId('beat-thought')).toBeInTheDocument();
		expect(screen.getByTestId('beat-did')).toBeInTheDocument();
	});

	it('invites the reader in before anything has happened', () => {
		render(StoryStrip, { props: { events: [] } });
		expect(screen.getByTestId('story-waiting')).toBeInTheDocument();
	});

	it('keeps earlier turns beside the current one, at a glance', () => {
		render(StoryStrip, { props: { events: [...turn(1), ...turn(2)] } });
		expect(screen.getByTestId('story-turn-1')).toBeInTheDocument();
		expect(screen.getByTestId('story-turn-current')).toHaveTextContent('Turn 2');
	});
});

describe('a refusal, which used to be invisible', () => {
	it('shows what the world said, in the strip', () => {
		render(StoryStrip, {
			props: {
				events: [saw(1, 'The chest is locked.'), refused(1, 'The chest is locked tight.')]
			}
		});
		expect(screen.getByTestId('beat-refused')).toHaveTextContent('The chest is locked tight.');
	});

	/** Colour must never carry it alone (`04-…` §7): the caption and icon do too. */
	it('does not rely on colour to say something went wrong', () => {
		render(StoryStrip, { props: { events: [refused(1, 'The chest is locked tight.')] } });
		const beat = screen.getByTestId('beat-refused');
		expect(beat.textContent).toContain('locked tight');
		expect(beat.textContent).toContain('😕');
	});
});

describe('the bridge to the real trace', () => {
	it('offers "see more" once a beat is opened, and not before', async () => {
		render(StoryStrip, { props: { events: turn(1), onseemore: vi.fn() } });
		expect(screen.queryByTestId('see-more')).not.toBeInTheDocument();

		await fireEvent.click(screen.getByTestId('beat-saw'));
		expect(screen.getByTestId('see-more')).toBeInTheDocument();
	});

	it('asks for the event the beat came from, not the top of the trace', async () => {
		const onseemore = vi.fn();
		const events = turn(1);
		render(StoryStrip, { props: { events, onseemore } });

		await fireEvent.click(screen.getByTestId('beat-did'));
		await fireEvent.click(screen.getByTestId('see-more'));

		expect(onseemore).toHaveBeenCalledTimes(1);
		const [index] = onseemore.mock.calls[0] ?? [];
		expect(events[index as number]?.type).toBe('action.performed');
	});

	it('closes again when the same beat is tapped twice', async () => {
		render(StoryStrip, { props: { events: turn(1), onseemore: vi.fn() } });
		await fireEvent.click(screen.getByTestId('beat-saw'));
		await fireEvent.click(screen.getByTestId('beat-saw'));
		expect(screen.queryByTestId('see-more')).not.toBeInTheDocument();
	});
});

describe('the play route’s live region (D16)', () => {
	it('announces the turn as one sentence, not beat by beat', () => {
		render(StoryStrip, { props: { events: turn(1) } });
		const announcer = screen.getByTestId('story-announcer');

		expect(announcer).toHaveAttribute('aria-live', 'polite');
		// One utterance covering the whole turn: a reader interrupting itself four
		// times a turn is worse than a slightly longer sentence.
		expect(announcer).toHaveTextContent(
			'Teddy is to the east. I will go east. You roll one square east.'
		);
	});
});

describe('reading it aloud', () => {
	it('stays quiet unless a grown-up switched it on', () => {
		const narrator = fakeNarrator();
		render(StoryStrip, { props: { events: turn(1), narrator } });
		expect(narrator.said).toEqual([]);
	});

	it('reads the turn when it is switched on', () => {
		const narrator = fakeNarrator();
		render(StoryStrip, { props: { events: turn(1), readAloud: true, narrator } });
		expect(narrator.said).toEqual([
			'Teddy is to the east. I will go east. You roll one square east.'
		]);
	});

	it('does not repeat itself when nothing has changed', async () => {
		const narrator = fakeNarrator();
		const { rerender } = render(StoryStrip, {
			props: { events: turn(1), readAloud: true, narrator }
		});
		await rerender({ events: turn(1), readAloud: true, narrator });
		expect(narrator.said).toHaveLength(1);
	});

	it('hushes when it is switched off mid-run', async () => {
		const narrator = fakeNarrator();
		const { rerender } = render(StoryStrip, {
			props: { events: turn(1), readAloud: true, narrator }
		});
		await rerender({ events: turn(1), readAloud: false, narrator });
		expect(narrator.hush).toHaveBeenCalled();
	});
});
