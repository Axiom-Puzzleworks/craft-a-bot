import {
	buildRuntimes,
	collectGuardrails,
	resolveBudgets,
	type AgentSpec,
	type ChatRequest
} from '@craftabot/core';
import { createMockProvider } from '@craftabot/core/testing';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { agentSpecSchema } from '@craftabot/core';
import { buildRegistry, runToCompletion } from './harness.js';

/**
 * **The dead-config audit** (`13-…` §3, closing `12-…` D10).
 *
 * Every field in `AgentSpec` is a control somebody can turn. A control that
 * turns nothing is worse than a missing one: it tells the user a lie about
 * what their bot is, and it does it in the one place — the workbench — where
 * the whole product's promise is that what you build is what you get.
 *
 * V1.0 shipped four of them (D10). `customGoalText` is the sharpest: a child
 * writes their own goal on the Free Play card, the play screen dutifully shows
 * it back, and the bot is never told. The card is a prop.
 *
 * The audit works in two halves:
 *
 *  1. **Structural** — the field list is read off the Zod schema, so a field
 *     added without a probe fails this suite rather than slipping through.
 *     That is what stops the next `customGoalText`.
 *  2. **Behavioural** — each probe changes one field and asserts that
 *     *something the engine does* changes with it. Not that the field is
 *     mentioned somewhere in the source: that it reaches the model, the
 *     guardrails, or the budget.
 *
 * It lives in `pack-starter` because this is the only package that sees core,
 * governance and real content at once — `core` cannot import `governance`, so
 * an audit in `core` could not see the Safety brick consume anything.
 */

/** Read-only lookups, so one instance safely serves every probe. */
const policyRegistry = buildRegistry();

const BASE: AgentSpec = {
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Testbot',
	bricks: {
		llm: {
			cartridgeId: 'test/mock-brain',
			temperature: 0,
			maxTokens: 256,
			personality: 'Cheerful.'
		},
		memory: { windowSize: 10, notebook: true },
		tools: { enabled: ['starter/calculator'] },
		sense: { channels: ['sight', 'compass'] },
		actions: { enabled: ['move', 'say'] },
		safety: { maxTicks: 30, blockedActions: ['celebrate'], approvalMode: false, repeatLimit: 3 }
	},
	goalCardId: 'starter/say-hello',
	customGoalText: 'Say hello to Teddy, politely.',
	createdAt: '2026-08-13T09:00:00Z',
	updatedAt: '2026-08-13T09:00:00Z',
	schemaVersion: 1
};

/** A deep clone the probes can scribble on without leaking into each other. */
function draft(): AgentSpec {
	return structuredClone(BASE);
}

/**
 * Everything the engine visibly does with a spec, as one comparable string:
 * what it asked the model, what it offered the model, what it told the model,
 * what it budgeted, and what policy it compiled.
 */
async function behaviourOf(spec: AgentSpec): Promise<string> {
	const requests: ChatRequest[] = [];
	const provider = createMockProvider({
		script: (request) => {
			requests.push(request);
			return {
				text: 'Looking about.',
				toolCall: { name: 'move', arguments: { direction: 'east' } }
			};
		}
	});

	/*
	 * Two ticks, not one (WP15). A field that only shows up in how *history* is
	 * rendered — `memory.strategy` is the first — is invisible on tick 1, where
	 * the window is empty and every strategy composes the same thing. A probe
	 * that cannot see its field is worse than no probe: it passes.
	 */
	const run = await runToCompletion({ script: [], spec, provider, maxTicks: 2, stepLimit: 2 });

	return JSON.stringify({
		requests: requests.map((request) => ({
			model: request.model,
			temperature: request.temperature,
			maxTokens: request.maxTokens,
			offered: (request.tools ?? []).map((tool) => tool.name).sort(),
			// The tool protocol is part of what the model was told (E7). Serialising
			// only role and content would have hidden an entire prompt strategy.
			messages: request.messages.map(
				(message) =>
					`${message.role}: ${message.content}` +
					(message.toolCalls ? ` calls=${JSON.stringify(message.toolCalls)}` : '') +
					(message.toolCallId ? ` answers=${message.toolCallId}` : '')
			)
		})),
		observations: run.byType('sense').map((event) => JSON.stringify(event.payload)),
		memory: run.byType('memory.updated').map((event) => JSON.stringify(event.payload)),
		budgets: resolveBudgets(spec, buildRegistry()),
		// The rules the fitted bricks install (slice 3d): what used to be compiled
		// from the spec is now contributed by the brick that owns the dials.
		policy: collectGuardrails(
			buildRuntimes({
				spec,
				registry: policyRegistry,
				context: {
					random: () => 0,
					getPolicyCard: (id) => policyRegistry.getPolicyCard(id),
					getAction: (id) => policyRegistry.getAction(id),
					fetch: () => Promise.reject(new Error('fetch is not used in these tests')),
					getCredential: () => undefined,
					getGuardrailService: () => undefined
				}
			})
		).map((guardrail) => `${guardrail.id}: ${guardrail.description}`)
	});
}

type Probe = {
	/** Dotted path into AgentSpec, matching what the schema walk produces. */
	path: string;
	change: (spec: AgentSpec) => void;
};

const PROBES: Probe[] = [
	{
		path: 'bricks.llm.cartridgeId',
		change: (spec) => {
			if (spec.bricks.llm) spec.bricks.llm.cartridgeId = '';
		}
	},
	{
		path: 'bricks.llm.temperature',
		change: (spec) => {
			if (spec.bricks.llm) spec.bricks.llm.temperature = 1.5;
		}
	},
	{
		path: 'bricks.llm.maxTokens',
		change: (spec) => {
			if (spec.bricks.llm) spec.bricks.llm.maxTokens = 999;
		}
	},
	{
		path: 'bricks.llm.personality',
		change: (spec) => {
			if (spec.bricks.llm) spec.bricks.llm.personality = 'Gloomy and suspicious.';
		}
	},
	{
		path: 'bricks.memory.windowSize',
		change: (spec) => {
			if (spec.bricks.memory) spec.bricks.memory.windowSize = 3;
		}
	},
	{
		path: 'bricks.memory.notebook',
		change: (spec) => {
			if (spec.bricks.memory) spec.bricks.memory.notebook = false;
		}
	},
	{
		path: 'bricks.memory.strategy',
		change: (spec) => {
			if (spec.bricks.memory) spec.bricks.memory.strategy = 'transcript';
		}
	},
	{
		path: 'bricks.tools.enabled',
		change: (spec) => {
			spec.bricks.tools = { enabled: ['starter/dice'] };
		}
	},
	{
		path: 'bricks.sense.channels',
		change: (spec) => {
			spec.bricks.sense = { channels: ['clock'] };
		}
	},
	{
		path: 'bricks.actions.enabled',
		change: (spec) => {
			spec.bricks.actions = { enabled: ['move'] };
		}
	},
	{
		path: 'bricks.safety.maxTicks',
		change: (spec) => {
			if (spec.bricks.safety) spec.bricks.safety.maxTicks = 99;
		}
	},
	{
		path: 'bricks.safety.blockedActions',
		change: (spec) => {
			if (spec.bricks.safety) spec.bricks.safety.blockedActions = [];
		}
	},
	{
		path: 'bricks.safety.approvalMode',
		change: (spec) => {
			if (spec.bricks.safety) spec.bricks.safety.approvalMode = true;
		}
	},
	{
		path: 'bricks.safety.repeatLimit',
		change: (spec) => {
			if (spec.bricks.safety) spec.bricks.safety.repeatLimit = 7;
		}
	},
	{
		path: 'bricks.safety.policyCards',
		change: (spec) => {
			if (spec.bricks.safety) spec.bricks.safety.policyCards = ['starter/policy/wrap-up-by-ten'];
		}
	},
	{
		path: 'goalCardId',
		change: (spec) => {
			spec.goalCardId = 'starter/snack';
		}
	},
	{
		path: 'customGoalText',
		change: (spec) => {
			spec.customGoalText = 'Ignore Teddy entirely and count the blocks instead.';
		}
	}
];

/**
 * Fields that are deliberately inert as far as the engine is concerned, each
 * with the reason. Being on this list is a decision, not an oversight — which
 * is the difference between this and simply not testing them.
 */
const EXEMPT: Record<string, string> = {
	id: 'Identity. Names the record in storage; the engine never reads it.',
	name: 'The name on the box. Shelf, box art and end cards use it — the bot is not told its own name, which is a deliberate gap worth revisiting when the prompt gets an identity section.',
	createdAt: 'Storage metadata.',
	updatedAt: 'Storage metadata.',
	schemaVersion: 'Migration bookkeeping, consumed by the kit-file migrator rather than the engine.'
};

/** Leaf field paths of AgentSpec, read off the schema rather than hand-listed. */
function schemaFieldPaths(): string[] {
	const paths: string[] = [];
	for (const [key, field] of Object.entries(agentSpecSchema.shape)) {
		if (key !== 'bricks') {
			paths.push(key);
			continue;
		}
		const bricks = unwrap(field);
		if (!(bricks instanceof z.ZodObject)) continue;
		for (const [brick, definition] of Object.entries(bricks.shape)) {
			const shape = unwrap(definition);
			if (!(shape instanceof z.ZodObject)) continue;
			for (const leaf of Object.keys(shape.shape)) paths.push(`bricks.${brick}.${leaf}`);
		}
	}
	return paths.sort();
}

/** Peel `.optional()` / `.default()` wrappers off to reach the object underneath. */
function unwrap(schema: unknown): unknown {
	let current = schema;
	while (
		current instanceof z.ZodOptional ||
		current instanceof z.ZodDefault ||
		current instanceof z.ZodNullable
	) {
		current = current.unwrap();
	}
	return current;
}

describe('the dead-config audit', () => {
	it('has a probe or a written exemption for every field in the schema', () => {
		const accounted = new Set([...PROBES.map((probe) => probe.path), ...Object.keys(EXEMPT)]);
		const orphans = schemaFieldPaths().filter((path) => !accounted.has(path));

		// A new spec field with no probe lands here. Wire it to something, or
		// add it to EXEMPT with the reason it does nothing — but decide.
		expect(orphans).toEqual([]);
	});

	it('does not carry probes for fields that no longer exist', () => {
		const known = new Set(schemaFieldPaths());
		expect(PROBES.map((probe) => probe.path).filter((path) => !known.has(path))).toEqual([]);
	});

	/*
	 * `customGoalText` was carved out here while it was the one field the engine
	 * ignored (D10). WP17 §2.5 wired it to the prompt, so it goes back in the
	 * table with everything else and needs no special case.
	 */
	it.each(PROBES)('$path changes what the engine does', async ({ change }) => {
		const before = await behaviourOf(draft());
		const mutated = draft();
		change(mutated);
		expect(await behaviourOf(mutated)).not.toBe(before);
	});
});
