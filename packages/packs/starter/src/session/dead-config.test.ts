import { resolveBudgets, type AgentSpec, type ChatRequest } from '@craftabot/core';
import { createMockProvider } from '@craftabot/core/testing';
import { guardrailsForSpec } from '@craftabot/governance';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { agentSpecSchema } from '@craftabot/core';
import { runToCompletion } from './harness.js';

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

	const run = await runToCompletion({ script: [], spec, provider, maxTicks: 1, stepLimit: 1 });

	return JSON.stringify({
		requests: requests.map((request) => ({
			model: request.model,
			temperature: request.temperature,
			maxTokens: request.maxTokens,
			offered: (request.tools ?? []).map((tool) => tool.name).sort(),
			messages: request.messages.map((message) => `${message.role}: ${message.content}`)
		})),
		observations: run.byType('sense').map((event) => JSON.stringify(event.payload)),
		memory: run.byType('memory.updated').map((event) => JSON.stringify(event.payload)),
		budgets: resolveBudgets(spec),
		policy: guardrailsForSpec(spec).map((guardrail) => `${guardrail.id}: ${guardrail.description}`)
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

	const live = PROBES.filter((probe) => probe.path !== 'customGoalText');

	it.each(live)('$path changes what the engine does', async ({ change }) => {
		const before = await behaviourOf(draft());
		const mutated = draft();
		change(mutated);
		expect(await behaviourOf(mutated)).not.toBe(before);
	});

	/**
	 * D10, test-first. The Free Play card is "a laminated card with a marker
	 * pen" (`02-…` §3): the user writes the goal, the bench stores it, the play
	 * screen renders it — and `composePrompt` uses `goalCard.goalText`, so the
	 * bot is told the printed goal and never the written one.
	 *
	 * `it.fails` because the fix is E2/`session.declareOutcome`-adjacent prompt
	 * work in WP13, not a test-estate change. When the prompt starts carrying
	 * the custom text this test will start *passing*, which makes `it.fails`
	 * fail, which is the reminder to delete this comment and move the case up
	 * into the table above.
	 */
	it.fails('customGoalText changes what the engine does — it does not, yet (D10)', async () => {
		const before = await behaviourOf(draft());
		const mutated = draft();
		mutated.customGoalText = 'Ignore Teddy entirely and count the blocks instead.';
		expect(await behaviourOf(mutated)).not.toBe(before);
	});
});
