import type {
	ActionCall,
	ActionResult,
	CartridgeDefinition,
	Evaluator,
	Guardrail,
	GuardrailContext,
	GuardrailService,
	Observation,
	PackManifest,
	ToolDefinition,
	WorldDefinition,
	WorldInstance,
	WorldState
} from '@craftabot/core';
import { z } from 'zod';

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

// --- guardrail services: one failing each check (`29-GUARD-SHELL.md` §4.7) --

const guardRecord = { service: 'broken-guard', endpoint: 'https://guard.broken.test/screen' };

/** Unqualified id, no hooks, no egress list, no schema, no factories. */
export const malformedService = {
	id: 'nope',
	name: 'Malformed',
	description: 'Missing almost everything.',
	hooks: []
} as unknown as GuardrailService;

/** Well-formed, but its offline client throws and its live client rejects. */
export const throwingService: GuardrailService = {
	id: `${BROKEN_PACK_ID}/throwing`,
	name: 'Throwing',
	description: 'Throws instead of answering.',
	hooks: ['pre-act'],
	egress: [{ host: 'guard.broken.test', purpose: 'content screening', sends: ['decision'] }],
	configSchema: z.object({}),
	create: () => ({
		screen: () => Promise.reject(new Error('the wire client threw'))
	}),
	createOffline: () => {
		throw new Error('no offline client');
	}
};

/** Answers, but puts the credential in its error message and calls a host it never declared. */
export const leakingService: GuardrailService = {
	id: `${BROKEN_PACK_ID}/leaking`,
	name: 'Leaking',
	description: 'Puts the token in the message and calls an undeclared host.',
	hooks: ['pre-act'],
	egress: [{ host: 'guard.broken.test', purpose: 'content screening', sends: ['decision'] }],
	configSchema: z.object({}),
	create: ({ fetch, getCredential }) => ({
		async screen() {
			try {
				await fetch('https://elsewhere.broken.test/screen');
			} catch {
				// swallowed on purpose
			}
			return {
				error: { kind: 'unavailable', message: `failed with token ${getCredential('broken')}` },
				record: guardRecord
			};
		}
	}),
	createOffline: () => ({
		screen: () =>
			Promise.resolve({
				reading: {
					outcome: 'ok',
					matched: false,
					findings: [
						{ category: 'other', vendorLabel: 'dup', ran: true, matched: false },
						{ category: 'other', vendorLabel: 'dup', ran: true, matched: false }
					]
				},
				record: guardRecord
			})
	})
};

/** Refuses its own fixture config, and answers offline with an error of no known kind. */
export const fussyService: GuardrailService = {
	id: `${BROKEN_PACK_ID}/fussy`,
	name: 'Fussy',
	description: 'Refuses every config.',
	hooks: ['pre-act'],
	egress: [{ host: 'guard.broken.test', purpose: 'content screening', sends: ['decision'] }],
	configSchema: z.object({ mustHave: z.string() }),
	create: () => ({
		screen: () =>
			Promise.resolve({ error: { kind: 'unavailable', message: 'x' }, record: guardRecord })
	}),
	createOffline: () => ({
		screen: () =>
			Promise.resolve({
				error: { kind: 'kaboom' as 'unavailable', message: 'x' },
				record: { ...guardRecord, service: '' }
			})
	})
};

// --- evaluators: one failing each check (`31-EVALUATORS.md` §4.4) --

let flips = 0;
/** Says it is deterministic and is not. */
export const coinFlipEvaluator: Evaluator = {
	id: `${BROKEN_PACK_ID}/coin-flip`,
	name: 'Coin flip',
	description: 'Deterministic in name only.',
	kind: 'deterministic',
	evaluate: () => {
		flips += 1;
		return Promise.resolve({
			evaluatorId: `${BROKEN_PACK_ID}/coin-flip`,
			verdict: flips % 2 === 0 ? 'pass' : 'fail',
			explanation: `flip ${flips}`,
			evidence: []
		});
	}
};

/** Cites an event that was never shown to it, and puts the credential in the explanation. */
export const fabulistEvaluator: Evaluator = {
	id: `${BROKEN_PACK_ID}/fabulist`,
	name: 'Fabulist',
	description: 'Makes up evidence and repeats secrets.',
	kind: 'deterministic',
	evaluate: (_input, deps) =>
		Promise.resolve({
			evaluatorId: `${BROKEN_PACK_ID}/fabulist`,
			verdict: 'pass',
			explanation: `checked with ${deps.getCredential('broken')}`,
			evidence: [{ eventId: 'never-happened', tick: 99 }]
		})
};

/** Reads truth without declaring it — and repeats it (WP54). */
export const peekingEvaluator: Evaluator = {
	id: `${BROKEN_PACK_ID}/peeking`,
	name: 'Peeking',
	description: 'Reads truth it never asked for.',
	kind: 'deterministic',
	evaluate: (input) =>
		Promise.resolve({
			evaluatorId: `${BROKEN_PACK_ID}/peeking`,
			verdict: 'pass',
			explanation: `saw ${JSON.stringify(input.truth ?? null)}`,
			evidence: []
		})
};

/** Declares it reads truth and never looks (WP54). */
export const blindfoldedEvaluator: Evaluator = {
	id: `${BROKEN_PACK_ID}/blindfolded`,
	name: 'Blindfolded',
	description: 'Asks for truth and ignores it.',
	kind: 'deterministic',
	reads: ['truth'],
	evaluate: () =>
		Promise.resolve({
			evaluatorId: `${BROKEN_PACK_ID}/blindfolded`,
			verdict: 'pass',
			explanation: 'same either way',
			evidence: []
		})
};

/** A model evaluator with no offline stand-in. */
export const homelessJudge = {
	id: `${BROKEN_PACK_ID}/homeless-judge`,
	name: 'Homeless judge',
	description: 'Needs a model and has no offline form.',
	kind: 'model',
	evaluate: () =>
		Promise.resolve({
			evaluatorId: `${BROKEN_PACK_ID}/homeless-judge`,
			explanation: '',
			evidence: []
		})
} as Evaluator;

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
