import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '@craftabot/core';
import { workbenchRoot } from '../../test-support/paths.js';
import { applyEvent, emptyProjection, projectThrough } from './run-projection.js';

/**
 * **The fold that live runs and replays share** (`16-…` §1.4, `15-…` §3).
 *
 * §1.4 asks that a replayed run be "pixel-consistent with a live run". The way
 * that is made true is by there being one reducer rather than two, so what
 * these tests hold down is the properties that would let the two drift apart
 * again — that folding is a pure function of the events, and that arriving at
 * turn N by scrubbing lands on the same state as arriving there by playing.
 */

/**
 * The committed golden trace: a real Say Hello run, byte-stable since WP13 and
 * the fixture the engine's own conformance tests use.
 */
function goldenTrace(): EngineEvent[] {
	const path = join(
		workbenchRoot(),
		'../../packages/packs/starter/src/fixtures/trace.say-hello.v1.json'
	);
	const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
	return (Array.isArray(parsed) ? parsed : (parsed as { events: EngineEvent[] }).events) ?? [];
}

describe('the run projection', () => {
	it('starts blank', () => {
		const state = emptyProjection();

		expect(state.tick).toBe(0);
		expect(state.events).toEqual([]);
		expect(state.world).toBeUndefined();
		expect(state.outcome).toBeUndefined();
	});

	it('folds the golden trace to a finished run', () => {
		const events = goldenTrace();
		expect(events.length).toBeGreaterThan(0);

		const state = projectThrough(events);

		expect(state.started).toBe(true);
		expect(state.outcome).toBe('SUCCESS');
		expect(state.world).toBeDefined();
		expect(state.events).toHaveLength(events.length);
	});

	/**
	 * The property that matters. A replay folds the whole trace in one go; a live
	 * run folded the same events one at a time as they arrived. If those two ever
	 * disagreed, a replayed run would show something the run never did.
	 */
	it('reaches the same state one event at a time as it does in one go', () => {
		const events = goldenTrace();

		const allAtOnce = projectThrough(events);
		const oneByOne = emptyProjection();
		for (const event of events) applyEvent(oneByOne, event);

		expect(oneByOne).toEqual(allAtOnce);
	});

	/**
	 * Scrubbing back has to land on the state the run actually passed through,
	 * not an approximation of it — which is why `projectThrough` re-folds from
	 * the start rather than trying to undo events.
	 */
	it('scrubbing to a turn shows that turn, not the end', () => {
		const events = goldenTrace();
		const lastTick = events.at(-1)?.tick ?? 0;
		expect(lastTick).toBeGreaterThan(0);

		const midway = projectThrough(events, lastTick - 1);
		const end = projectThrough(events, lastTick);

		expect(midway.outcome).toBeUndefined();
		expect(end.outcome).toBe('SUCCESS');
		expect(midway.events.length).toBeLessThan(end.events.length);
	});

	it('folding to the last turn is the same as folding everything', () => {
		const events = goldenTrace();
		const lastTick = events.at(-1)?.tick ?? 0;

		expect(projectThrough(events, lastTick)).toEqual(projectThrough(events));
	});

	/** Replaying the same trace twice gives the same picture both times. */
	it('is deterministic', () => {
		const events = goldenTrace();

		expect(projectThrough(events)).toEqual(projectThrough(events));
	});
});
