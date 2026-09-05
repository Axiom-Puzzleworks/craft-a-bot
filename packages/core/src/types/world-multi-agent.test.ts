import { describe, expectTypeOf, it } from 'vitest';
import type { GridWorldAgent, GridWorldItemLocation, GridWorldState } from './grid-world.js';
import type { AgentHandle, WorldInstance } from './world.js';

/**
 * **WP29 stage B** (`23-MULTI-AGENT-DESIGN.md` §4.1–§4.3, §10): the identity
 * and state vocabulary, proven dormant before anything implements it.
 *
 * Two claims per shape, both load-bearing:
 *
 *  - **Every existing literal still satisfies the type.** A `WorldInstance`
 *    with no `forAgent`, a `GridWorldState` with no `agents`, an
 *    `{kind:'carried'}` location with no `agentId` — the exact shapes every
 *    world pack and every stored snapshot has used since before this stage —
 *    must still be assignable, or stage B would already be the breaking
 *    change stage D is supposed to avoid.
 *  - **The new field, when present, is exactly what `23-…` specifies.** Not
 *    "compiles", but the precise signature — `forAgent` takes one
 *    `AgentHandle` and returns a `WorldInstance`, `agents` is
 *    `GridWorldAgent[]`, `agentId` is a `string`.
 *
 * No implementation exists yet — these are compile-time assertions only,
 * `expectTypeOf` in the same style `schemas/shape-drift.test.ts` already
 * uses for this codebase's other single-source-of-truth guards.
 */

describe('AgentHandle', () => {
	it('is an id plus a display name, and (WP55) an optional role — nothing else', () => {
		expectTypeOf<AgentHandle>().toEqualTypeOf<{
			agentId: string;
			name: string;
			role?: 'agent' | 'counterpart';
		}>();
	});
});

describe('WorldInstance.forAgent — the multi-agent opt-in', () => {
	it('is optional: a world written before WP29 still satisfies the interface', () => {
		const solo: WorldInstance = {
			snapshot: () => ({}),
			observe: () => ({ channels: [], text: '', data: {} }),
			perform: () => ({ ok: true, narration: '', stateDiff: [] }),
			test: () => false,
			reset: () => {}
		};
		expectTypeOf(solo).toMatchTypeOf<WorldInstance>();
		expectTypeOf(solo.forAgent).toEqualTypeOf<WorldInstance['forAgent']>();
	});

	it('when present, takes exactly one AgentHandle and returns a WorldInstance', () => {
		expectTypeOf<Required<WorldInstance>['forAgent']>().parameters.toEqualTypeOf<[AgentHandle]>();
		expectTypeOf<Required<WorldInstance>['forAgent']>().returns.toEqualTypeOf<WorldInstance>();
	});
});

describe('GridWorldAgent', () => {
	it('is an id, a display name, and a position — the room-roster shape', () => {
		const agent: GridWorldAgent = { id: 'a1', name: 'Robo', position: { x: 0, y: 0 } };
		expectTypeOf(agent).toEqualTypeOf<GridWorldAgent>();
	});
});

describe('GridWorldState.agents', () => {
	const base = {
		width: 8,
		height: 6,
		bot: { position: { x: 0, y: 0 } },
		furniture: [],
		containers: [],
		characters: [],
		items: []
	};

	it('is optional: a snapshot with no agents field still satisfies the type', () => {
		const solo: GridWorldState = base;
		expectTypeOf(solo).toMatchTypeOf<GridWorldState>();
		expectTypeOf(solo.agents).toEqualTypeOf<GridWorldAgent[] | undefined>();
	});

	it('when present, is the whole roster, self included', () => {
		const hosted: GridWorldState = {
			...base,
			agents: [
				{ id: 'a1', name: 'Robo', position: { x: 0, y: 0 } },
				{ id: 'a2', name: 'Bolt', position: { x: 1, y: 0 } }
			]
		};
		expectTypeOf(hosted.agents).toEqualTypeOf<GridWorldAgent[] | undefined>();
	});
});

describe('GridWorldItemLocation "carried"', () => {
	it('agentId is optional: meaning "the (only) bot", as it always has', () => {
		const solo: GridWorldItemLocation = { kind: 'carried' };
		expectTypeOf(solo).toMatchTypeOf<GridWorldItemLocation>();
	});

	it('when present, names which agent is carrying it', () => {
		const hosted: GridWorldItemLocation = { kind: 'carried', agentId: 'a2' };
		expectTypeOf(hosted).toMatchTypeOf<GridWorldItemLocation>();
		if (hosted.kind === 'carried') expectTypeOf(hosted.agentId).toEqualTypeOf<string | undefined>();
	});
});
