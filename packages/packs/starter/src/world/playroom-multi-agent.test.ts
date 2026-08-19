import type { AgentHandle } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { playroom } from './playroom.js';
import type { PlayroomState } from './state.js';

/**
 * **WP29 stage D** (`23-MULTI-AGENT-DESIGN.md` §4.8, §10): the Playroom's
 * `forAgent` facade, tested directly against the shipped `tidy-together`
 * layout — no `SessionGroup` involved (that proof is stage E's). What matters
 * here is the seat-swap trick itself: two facades sharing one root instance
 * must never let one agent's turn corrupt another's.
 */

const ROBO: AgentHandle = { agentId: '11111111-1111-4111-8111-111111111111', name: 'Robo' };
const BOLT: AgentHandle = { agentId: '22222222-2222-4222-8222-222222222222', name: 'Bolt' };

function snapshotOf(instance: { snapshot(): unknown }): PlayroomState {
	return instance.snapshot() as PlayroomState;
}

describe('forAgent', () => {
	it('is implemented by the Playroom', () => {
		expect(playroom.create('tidy-together').forAgent).toBeTypeOf('function');
	});

	it('seats the first two agents at the layout’s two co-op starts', () => {
		const root = playroom.create('tidy-together');
		const robo = root.forAgent?.(ROBO);
		const bolt = root.forAgent?.(BOLT);
		expect(snapshotOf(robo!).bot.position).toEqual({ x: 0, y: 4 });
		expect(snapshotOf(bolt!).bot.position).toEqual({ x: 7, y: 5 });
	});

	it('lists every seated agent in `agents`, from either facade', () => {
		const root = playroom.create('tidy-together');
		const robo = root.forAgent?.(ROBO);
		root.forAgent?.(BOLT);
		const agents = snapshotOf(robo!).agents ?? [];
		expect(agents.map((agent) => agent.id).sort()).toEqual([BOLT.agentId, ROBO.agentId].sort());
		expect(agents.find((agent) => agent.id === ROBO.agentId)?.name).toBe('Robo');
	});

	it('returns a facade for the same seat when called twice with the same handle', () => {
		const root = playroom.create('tidy-together');
		const first = root.forAgent?.(ROBO);
		first!.perform({ name: 'move', arguments: { direction: 'north' } });
		const second = root.forAgent?.(ROBO);
		expect(snapshotOf(second!).bot.position).toEqual({ x: 0, y: 3 });
	});
});

describe('seat isolation under interleaved performs', () => {
	it('one agent moving never moves the other', () => {
		const root = playroom.create('tidy-together');
		const robo = root.forAgent?.(ROBO);
		const bolt = root.forAgent?.(BOLT);

		robo!.perform({ name: 'move', arguments: { direction: 'north' } });
		bolt!.perform({ name: 'move', arguments: { direction: 'west' } });
		robo!.perform({ name: 'move', arguments: { direction: 'north' } });

		const state = snapshotOf(robo!);
		const roboSeat = state.agents?.find((agent) => agent.id === ROBO.agentId);
		const boltSeat = state.agents?.find((agent) => agent.id === BOLT.agentId);
		expect(roboSeat?.position).toEqual({ x: 0, y: 2 });
		expect(boltSeat?.position).toEqual({ x: 6, y: 5 });
	});

	it('an illegal move by one agent leaves the other exactly where it was', () => {
		const root = playroom.create('tidy-together');
		const robo = root.forAgent?.(ROBO);
		const bolt = root.forAgent?.(BOLT);

		bolt!.perform({ name: 'move', arguments: { direction: 'north' } });
		const result = robo!.perform({ name: 'move', arguments: { direction: 'west' } }); // into the wall
		expect(result.ok).toBe(false);

		const boltSeat = snapshotOf(bolt!).agents?.find((agent) => agent.id === BOLT.agentId);
		expect(boltSeat?.position).toEqual({ x: 7, y: 4 });
	});

	it('the shared clock still advances once per turn, either agent’s', () => {
		const root = playroom.create('tidy-together');
		const robo = root.forAgent?.(ROBO);
		const bolt = root.forAgent?.(BOLT);
		robo!.perform({ name: 'move', arguments: { direction: 'north' } });
		bolt!.perform({ name: 'move', arguments: { direction: 'west' } });
		expect(snapshotOf(robo!).tick).toBe(2);
	});
});

describe('the collision rule', () => {
	it('refuses a move onto a seatmate’s square, in character', () => {
		const root = playroom.create('tidy-together');
		const robo = root.forAgent?.(ROBO);
		const bolt = root.forAgent?.(BOLT);

		// Walk Robo to (1,4), one square west of Bolt's own starting column path —
		// simplest: put Bolt directly in Robo's way by moving Bolt to (1,4) first.
		for (let i = 0; i < 6; i++) bolt!.perform({ name: 'move', arguments: { direction: 'west' } });
		for (let i = 0; i < 1; i++) bolt!.perform({ name: 'move', arguments: { direction: 'north' } });
		const boltSeat = snapshotOf(bolt!).agents?.find((agent) => agent.id === BOLT.agentId);
		expect(boltSeat?.position).toEqual({ x: 1, y: 4 });

		const result = robo!.perform({ name: 'move', arguments: { direction: 'east' } });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('Bolt');

		const roboSeat = snapshotOf(robo!).agents?.find((agent) => agent.id === ROBO.agentId);
		expect(roboSeat?.position).toEqual({ x: 0, y: 4 });
	});
});

describe('observation truthfulness per seat', () => {
	it('describes a nearby seatmate by name, from sight', () => {
		const root = playroom.create('tidy-together');
		const robo = root.forAgent?.(ROBO);
		const bolt = root.forAgent?.(BOLT);

		// Bring Bolt within Robo's one-square sight radius, one square east of Robo.
		for (let i = 0; i < 6; i++) bolt!.perform({ name: 'move', arguments: { direction: 'west' } });
		bolt!.perform({ name: 'move', arguments: { direction: 'north' } }); // (1,4)

		const seen = robo!.observe(['sight']).text;
		expect(seen).toContain('Bolt');
	});

	it('says nothing about a seatmate out of sight range', () => {
		const root = playroom.create('tidy-together');
		const robo = root.forAgent?.(ROBO);
		root.forAgent?.(BOLT); // stays at (7,5), far from Robo's (0,4)

		const seen = robo!.observe(['sight']).text;
		expect(seen).not.toContain('Bolt');
	});
});

describe('carried-item attribution', () => {
	it('stamps the acting agent’s id on pick-up, and only that agent sees it in their hands', () => {
		const root = playroom.create('tidy-together');
		const robo = root.forAgent?.(ROBO);
		const bolt = root.forAgent?.(BOLT);

		// Robo walks to block-a at (2,1): 2 north, 1 east lands within reach at (1,2).
		robo!.perform({ name: 'move', arguments: { direction: 'north' } });
		robo!.perform({ name: 'move', arguments: { direction: 'north' } });
		robo!.perform({ name: 'move', arguments: { direction: 'east' } });
		const pickup = robo!.perform({ name: 'pick_up', arguments: { item: 'block-a' } });
		expect(pickup.ok).toBe(true);

		const state = snapshotOf(robo!);
		const item = state.items.find((candidate) => candidate.id === 'block-a');
		expect(item?.location).toEqual({ kind: 'carried', agentId: ROBO.agentId });

		expect(robo!.observe(['sight']).text).toContain('blue letter block');
		expect(bolt!.observe(['sight']).text).not.toContain('blue letter block');
	});

	it('never lets one agent pick up what the other is already carrying', () => {
		const root = playroom.create('tidy-together');
		const robo = root.forAgent?.(ROBO);
		const bolt = root.forAgent?.(BOLT);

		robo!.perform({ name: 'move', arguments: { direction: 'north' } });
		robo!.perform({ name: 'move', arguments: { direction: 'north' } });
		robo!.perform({ name: 'move', arguments: { direction: 'east' } });
		robo!.perform({ name: 'pick_up', arguments: { item: 'block-a' } });

		// `pick_up`'s handler (`actions.ts`) refuses any item whose location is
		// already `carried` — written for a world with one pair of hands, where
		// that could only ever mean "your own". It is still the right refusal
		// here: whoever's hands they are, Bolt's own attempt cannot succeed.
		const result = bolt!.perform({ name: 'pick_up', arguments: { item: 'block-a' } });
		expect(result.ok).toBe(false);
	});
});

describe('reset', () => {
	it('clears every seat, so the next binding starts fresh', () => {
		const root = playroom.create('tidy-together');
		const robo = root.forAgent?.(ROBO);
		robo!.perform({ name: 'move', arguments: { direction: 'north' } });

		root.reset();

		const again = root.forAgent?.(ROBO);
		expect(snapshotOf(again!).bot.position).toEqual({ x: 0, y: 4 });
	});
});

describe('a single-agent layout', () => {
	it('never gains an `agents` field just because forAgent exists on the type', () => {
		const instance = playroom.create('greeting');
		expect(snapshotOf(instance).agents).toBeUndefined();
	});
});
