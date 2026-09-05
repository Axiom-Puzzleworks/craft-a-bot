import { projectGroupThrough, projectThrough, type EngineEvent } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import twoSeat from '../../../../../packages/desk/src/fixtures/trace.desk-counterpart-offline.v1.json';

/**
 * The Run Lab shows a two-seat transcript from a group episode (WP55 stage
 * C, `46-…` §4.6): both seats share one root desk, so either seat's
 * `world.changed` carries the whole transcript — the merged stream folded
 * by `projectThrough` (what the Run Lab draws) and the foregrounded member
 * folded by `projectGroupThrough` both show both voices. Held over the
 * two-seat golden, so a change to either fold or the runtime moves it.
 */
const events = twoSeat as unknown as EngineEvent[];

type Line = { speaker: string; speakerName: string; text: string };
const transcriptOf = (world: unknown): Line[] =>
	((world as { transcript?: Line[] } | undefined)?.transcript ?? []) as Line[];

describe('a two-seat desk episode in the Run Lab', () => {
	it('the merged stream folds to a transcript with both voices', () => {
		const lines = transcriptOf(projectThrough(events).world);
		expect(lines.map((line) => line.speaker)).toEqual(
			expect.arrayContaining(['counterpart', 'agent'])
		);
		expect(lines.find((line) => line.speaker === 'agent')?.speakerName).toBe('Deskbot');
		expect(
			lines.filter((line) => line.speaker === 'counterpart').map((l) => l.speakerName)
		).toEqual(expect.arrayContaining(['A. Person']));
	});

	it('the foregrounded seat folds to the same transcript, whichever seat it is', () => {
		const foreground = projectGroupThrough(events);
		expect(foreground.foregroundedAgentId).toBeDefined();
		const lines = transcriptOf(foreground.member.world);
		expect(lines.map((line) => line.speaker)).toEqual(
			expect.arrayContaining(['counterpart', 'agent'])
		);
	});

	it('scrubbing back to tick 0 shows the visitor’s opening alone; tick 1 adds the clerk', () => {
		const opening = transcriptOf(projectThrough(events, 0).world);
		expect(opening).toHaveLength(1);
		expect(opening[0]).toMatchObject({
			speaker: 'counterpart',
			text: 'Hello, I have an appointment.'
		});
		const first = transcriptOf(projectThrough(events, 1).world);
		expect(first.map((line) => line.speaker)).toContain('agent');
	});
});
