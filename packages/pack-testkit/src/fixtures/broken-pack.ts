import type {
	ActionCall,
	ActionResult,
	CartridgeDefinition,
	Guardrail,
	GuardrailContext,
	Observation,
	PackManifest,
	ToolDefinition,
	WorldDefinition,
	WorldInstance,
	WorldState
} from '@craftabot/core';

/**
 * A pack that violates almost every `13-…` §7 check on purpose.
 *
 * Used only by `pack-testkit`'s own test suite, to prove the assertion
 * library actually rejects a bad pack with a useful message rather than
 * trusting that starter and openai passing means anything — a kit that said
 * yes to everything would pass those two as well.
 */

export const BROKEN_PACK_ID = 'broken';

// --- tools: unqualified id, throws, dishonest schema, empty output, non-deterministic ------

export const unqualifiedTool: ToolDefinition = {
	id: 'not-qualified-tool', // violates "{packId}/{localId}" (E6)
	name: 'Unqualified',
	description: 'Its id does not start with the pack id.',
	parameters: { type: 'object', properties: {}, additionalProperties: false },
	execute() {
		return { ok: true, output: 'fine' };
	}
};

export const throwingTool: ToolDefinition = {
	id: `${BROKEN_PACK_ID}/throws`,
	name: 'Throws',
	description: 'Always throws instead of returning a result.',
	parameters: { type: 'object', properties: {}, additionalProperties: false },
	execute() {
		throw new Error('boom');
	}
};

export const dishonestSchemaTool: ToolDefinition = {
	id: `${BROKEN_PACK_ID}/dishonest`,
	name: 'Dishonest schema',
	description: 'Declares a required field its own example omits, and returns nothing.',
	parameters: {
		type: 'object',
		properties: { requiredField: { type: 'string' } },
		required: ['requiredField']
	},
	execute() {
		return { ok: true, output: '' }; // also violates output-non-empty
	}
};

export const nondeterministicTool: ToolDefinition = {
	id: `${BROKEN_PACK_ID}/nondeterministic`,
	name: 'Nondeterministic',
	description: 'Reaches for Math.random instead of the injected source (hard rule 5).',
	parameters: { type: 'object', properties: {}, additionalProperties: false },
	execute() {
		// A counter rather than a real die: a die matches itself one time in
		// six, and a fixture that only *usually* misbehaves is a flaky test.
		nondeterministicCalls += 1;
		return { ok: true, output: 'rolled', data: { roll: nondeterministicCalls } };
	}
};
let nondeterministicCalls = 0;

export const brokenTools: ToolDefinition[] = [
	unqualifiedTool,
	throwingTool,
	dishonestSchemaTool,
	nondeterministicTool
];

// --- guardrails: illegal verdict shape, mutates its context, no description ----------------

export const badVerdictGuardrail: Guardrail = {
	id: `${BROKEN_PACK_ID}/bad-verdict`,
	name: 'Bad verdict',
	description: '', // violates description-present
	hooks: ['post-act'],
	check(): ReturnType<Guardrail['check']> {
		// Not a member of the closed GuardrailVerdict union at all.
		return { allowed: true } as unknown as Awaited<ReturnType<Guardrail['check']>>;
	}
};

export const mutatingGuardrail: Guardrail = {
	id: `${BROKEN_PACK_ID}/mutates`,
	name: 'Mutates its context',
	description: 'Writes to the context it was handed, which a guardrail must never do (08 §2).',
	hooks: ['pre-act'],
	check(ctx: GuardrailContext): ReturnType<Guardrail['check']> {
		ctx.tick = 999;
		return { allow: true };
	}
};

export function brokenGuardrailContext(): GuardrailContext {
	return {
		hook: 'pre-act',
		tick: 1,
		spec: {
			id: '00000000-0000-4000-8000-000000000002',
			name: 'Testbot',
			schemaVersion: 2,
			bricks: [],
			goalCardId: `${BROKEN_PACK_ID}/only`,
			identity: { displayName: 'Testbot', boxArtSeed: 'seed' },
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z'
		},
		usage: { ticks: 1, inputTokens: 0, outputTokens: 0 },
		worldState: {},
		history: []
	};
}

// --- world: throws, mutates on failure, no narration, non-deterministic, unreachable predicate --

interface BrokenWorldState extends WorldState {
	count: number;
}

const BROKEN_WORLD_ID = `${BROKEN_PACK_ID}/world`;

/**
 * Module-level, deliberately: state that survives a fresh `create()` is
 * exactly the "carried a side effect between two supposedly-independent
 * runs" bug the determinism check exists to catch, and doing it this way
 * (rather than `Math.random()`) makes the violation land every time instead
 * of only on the unlucky half of test runs.
 */
let callsSoFar = 0;

function createBrokenWorldInstance(): WorldInstance {
	const initial: BrokenWorldState = { count: 0 };
	let state: BrokenWorldState = structuredClone(initial);

	return {
		snapshot: (): WorldState => structuredClone(state),
		observe: (): Observation => ({ channels: [], text: '' }),
		perform(call: ActionCall): ActionResult {
			if (call.name === 'throws') {
				throw new Error('this action always throws');
			}
			if (call.name === 'mutates-on-failure') {
				// Reports failure but still changes state, and says nothing about why.
				state = { ...state, count: state.count + 1 };
				return { ok: false, narration: '' };
			}
			if (call.name === 'nondeterministic') {
				// A legal call whose effect is not a function of the script alone —
				// it depends on how many times this world has ever been asked before.
				callsSoFar += 1;
				state = { ...state, count: state.count + callsSoFar };
				return { ok: true, narration: 'did something' };
			}
			return { ok: false, narration: `"${call.name}" is not known here.` };
		},
		// "never-true" can never be observed — the predicate is unreachable.
		test: () => false,
		reset: () => {
			state = structuredClone(initial);
		}
	};
}

export const brokenWorld: WorldDefinition = {
	id: BROKEN_WORLD_ID,
	name: 'Broken World',
	layouts: [{ id: 'only', name: 'Only', initialState: { count: 0 } }],
	actions: [
		{
			id: `${BROKEN_WORLD_ID}/throws`,
			name: 'Throws',
			description: '',
			parameters: { type: 'object', properties: {}, additionalProperties: false }
		},
		{
			id: `${BROKEN_WORLD_ID}/mutates-on-failure`,
			name: 'Mutates on failure',
			description: '',
			parameters: { type: 'object', properties: {}, additionalProperties: false }
		},
		{
			id: `${BROKEN_WORLD_ID}/nondeterministic`,
			name: 'Nondeterministic',
			description: '',
			parameters: { type: 'object', properties: {}, additionalProperties: false }
		}
	],
	senses: [],
	predicates: { 'never-true': 'Never actually reachable by anything.' },
	create: createBrokenWorldInstance
};

// --- cartridge: an incomplete catalogue entry, only reachable by bypassing the type system --

export const incompleteCartridge = {
	id: `${BROKEN_PACK_ID}/incomplete`,
	providerId: 'mock'
	// missing model, displayName, blurb, stats, costHint, defaults — a JS pack
	// (or one built against an older core) has no compiler stopping it here.
} as unknown as CartridgeDefinition;

export const brokenPack: PackManifest = {
	id: BROKEN_PACK_ID,
	name: 'Deliberately Broken',
	version: '0.0.0',
	requiresCore: '>=0.0.1',
	tools: brokenTools,
	worlds: [brokenWorld],
	cartridges: [incompleteCartridge]
};

/** A second manifest whose id collides with a piece of `brokenPack`, for the collision check. */
export const collidingCompanionPack: PackManifest = {
	id: 'broken-companion',
	name: 'Collides on purpose',
	version: '0.0.1',
	requiresCore: '>=0.0.1',
	tools: [{ ...unqualifiedTool, id: throwingTool.id }] // same id as brokenPack's throwingTool
};
