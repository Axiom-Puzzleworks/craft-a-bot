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
import type { PackConformanceFixture } from '../types.js';

/**
 * A small, entirely compliant fixture pack — the positive counterpart to
 * `broken-pack.ts`. Its purpose is narrow: prove `describeConformance`
 * actually passes a pack that deserves to pass, so the broken-pack tests
 * prove something (a kit that rejects everything would "catch" a broken pack
 * too).
 */

export const EXAMPLE_PACK_ID = 'example';

// --- a tool: deterministic, honest schema, non-empty output ------------------------------

export const echoTool: ToolDefinition = {
	id: `${EXAMPLE_PACK_ID}/echo`,
	name: 'Echo',
	description: 'Repeats back what it was given.',
	parameters: {
		type: 'object',
		properties: { text: { type: 'string' } },
		required: ['text']
	},
	execute(rawArgs) {
		const args = rawArgs as { text: string };
		return { ok: true, output: `You said: ${args.text}`, data: { text: args.text } };
	}
};

// --- a guardrail: pure, legal verdict, described ------------------------------------------

export const alwaysAllowGuardrail: Guardrail = {
	id: `${EXAMPLE_PACK_ID}/always-allow`,
	name: 'Always Allow',
	description: 'Allows everything; exists to prove a guardrail can be well-behaved.',
	hooks: ['pre-act'],
	check(): ReturnType<Guardrail['check']> {
		return { allow: true };
	}
};

export function exampleGuardrailContext(): GuardrailContext {
	return {
		hook: 'pre-act',
		tick: 1,
		spec: {
			id: '00000000-0000-4000-8000-000000000001',
			name: 'Testbot',
			schemaVersion: 2,
			bricks: [],
			goalCardId: `${EXAMPLE_PACK_ID}/only`,
			identity: { displayName: 'Testbot', boxArtSeed: 'seed' },
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z'
		},
		usage: { ticks: 1, inputTokens: 0, outputTokens: 0 },
		worldState: {},
		history: []
	};
}

// --- a world: one legal script reaches its one predicate; one illegal call is rejected cleanly -----

interface ExampleWorldState extends WorldState {
	count: number;
}

const EXAMPLE_WORLD_ID = `${EXAMPLE_PACK_ID}/counter`;

function createExampleWorldInstance(): WorldInstance {
	const initial: ExampleWorldState = { count: 0 };
	let state: ExampleWorldState = structuredClone(initial);

	return {
		snapshot: (): WorldState => structuredClone(state),
		observe: (): Observation => ({ channels: [], text: `count is ${state.count}` }),
		perform(call: ActionCall): ActionResult {
			if (call.name === 'increment') {
				state = { ...state, count: state.count + 1 };
				return { ok: true, narration: 'Counted up by one.' };
			}
			return {
				ok: false,
				narration: `"${call.name}" is not something this world knows how to do.`
			};
		},
		test: (predicate) => (predicate === 'counted-to-two' ? state.count >= 2 : false),
		reset: () => {
			state = structuredClone(initial);
		}
	};
}

export const exampleWorld: WorldDefinition = {
	id: EXAMPLE_WORLD_ID,
	name: 'Counter',
	layouts: [{ id: 'only', name: 'Only', initialState: { count: 0 } }],
	actions: [
		{
			id: `${EXAMPLE_WORLD_ID}/increment`,
			name: 'Increment',
			description: 'Adds one.',
			parameters: { type: 'object', properties: {}, additionalProperties: false }
		}
	],
	senses: [],
	predicates: { 'counted-to-two': 'The count has reached two.' },
	create: createExampleWorldInstance
};

// --- a cartridge: a complete catalogue entry ------------------------------------------------

export const exampleCartridge: CartridgeDefinition = {
	id: `${EXAMPLE_PACK_ID}/mock-brain`,
	providerId: 'mock',
	model: 'mock-1',
	displayName: 'Mock Brain',
	blurb: 'Scripted and deterministic.',
	stats: { words: 2, reasoning: 2, speed: 3 },
	costHint: 'low',
	defaults: { temperature: 0, maxTokens: 256 }
};

export const examplePack: PackManifest = {
	id: EXAMPLE_PACK_ID,
	name: 'Example Pack',
	version: '0.0.1',
	requiresCore: '>=0.0.1',
	tools: [echoTool],
	worlds: [exampleWorld],
	cartridges: [exampleCartridge]
};

export const exampleFixture: PackConformanceFixture = {
	manifest: examplePack,
	world: {
		worldId: EXAMPLE_WORLD_ID,
		scripts: {
			'count to two': {
				layoutId: 'only',
				calls: [
					{ name: 'increment', arguments: {} },
					{ name: 'increment', arguments: {} }
				]
			}
		},
		illegalActions: [{ layoutId: 'only', call: { name: 'fly', arguments: {} } }]
	},
	tools: { examples: { [echoTool.id]: { text: 'hello' } } },
	guardrails: {
		guardrails: [{ guardrail: alwaysAllowGuardrail, context: exampleGuardrailContext() }]
	}
};
