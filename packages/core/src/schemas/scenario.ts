import { z } from 'zod';
import { runOutcomeSchema } from './shared.js';

/**
 * **A scenario** (`32-SCENARIOS.md` §4.1, WP44; `26-TARGET-DESIGN-V3.md`
 * §6.3): a goal card plus what a test needs — the threat vocabulary as
 * data, the content injected at start, what a safe and an unsafe run look
 * like, and which scripted plans stand in for a brain in CI. Pure data, so
 * a pack ships it, a campaign names it, a report groups by it and a JSONL
 * file becomes it.
 */

export const SCENARIO_SCHEMA_VERSION = 1;

/**
 * Content delivered into a world at the start of a run, through a door the
 * world already has: a line overheard, a manual entry, a tool's answer, a
 * radio message. A world that has no such doors omits `WorldInstance.inject`
 * and a scenario carrying injections is refused before the run.
 */
export const injectionSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('heard'),
		text: z.string().min(1),
		atTick: z.number().int().nonnegative().optional()
	}),
	z.object({ kind: z.literal('manual-entry'), key: z.string().min(1), text: z.string().min(1) }),
	z.object({
		kind: z.literal('tool-result'),
		toolId: z.string().min(1),
		match: z.string().optional(),
		result: z.unknown()
	}),
	z.object({
		kind: z.literal('radio'),
		fromName: z.string().min(1),
		channel: z.string().min(1),
		text: z.string().min(1)
	})
]);
export type Injection = z.infer<typeof injectionSchema>;

export const scenarioExpectationSchema = z.object({
	/** The outcome a *safe* run ends with, when one is expected at all. */
	outcome: runOutcomeSchema.optional(),
	/** Evaluator (or assertion card) ids and the verdict a safe run earns; an unsafe run earns the opposite. */
	evaluators: z
		.array(z.object({ evaluatorId: z.string().min(1), verdict: z.enum(['pass', 'fail']) }))
		.default([])
});

export const scenarioDefinitionSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	description: z.string().optional(),
	/** The card that binds world, layout and success predicate. */
	goalCardId: z.string().min(1),
	/** Threat and control vocabulary (`19-…` #n, OWASP ASI ids) — data, so a report can group by it. */
	tags: z.array(z.string()).default([]),
	injections: z.array(injectionSchema).default([]),
	expect: scenarioExpectationSchema.default({ evaluators: [] }),
	/** Scripted plans by tier name — `scripted-optimal`, `scripted-adversary` — the `plans.ts` precedent. */
	plans: z.object({ safe: z.string().optional(), unsafe: z.string().optional() }).default({}),
	schemaVersion: z.literal(SCENARIO_SCHEMA_VERSION)
});
export type ScenarioDefinition = z.infer<typeof scenarioDefinitionSchema>;
export type ScenarioDefinitionInput = z.input<typeof scenarioDefinitionSchema>;

export function parseScenarioDefinition(value: unknown): ScenarioDefinition {
	return scenarioDefinitionSchema.parse(value);
}

export function safeParseScenarioDefinition(
	value: unknown
): ReturnType<typeof scenarioDefinitionSchema.safeParse> {
	return scenarioDefinitionSchema.safeParse(value);
}

/**
 * A scenario pack file (`32-…` §4.5): what the corpus importer writes and
 * the registry reads back as a pack — content, never code.
 */
export const scenarioPackFileSchema = z.object({
	format: z.literal('craftabot-scenarios'),
	formatVersion: z.literal(1),
	id: z.string().min(1),
	name: z.string().min(1),
	scenarios: z.array(scenarioDefinitionSchema)
});
export type ScenarioPackFile = z.infer<typeof scenarioPackFileSchema>;
