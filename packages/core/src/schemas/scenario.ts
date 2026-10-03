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
	}),
	/**
	 * Which of a desk's counterpart scripts this scenario puts across the desk
	 * (WP55, `46-COUNTERPARTS.md` §4.2). A world with no script of that id
	 * ignores it, as every world ignores a kind it does not take.
	 */
	z.object({ kind: z.literal('counterpart'), scriptId: z.string().min(1) }),
	/**
	 * The operational incident (WP72, `61-LAST-DECKS.md` §4.1; `41-…` §6.5.5): a
	 * degraded model on cue. Delivered by the *session* to the provider call,
	 * never to a world — the one injection that is not world content. From
	 * `atTick` (the first think is tick 1), the next `count` provider calls
	 * fault, each written to the trace as `error` then `provider.retried`; the
	 * run goes on.
	 */
	z.object({
		kind: z.literal('provider-fault'),
		atTick: z.number().int().nonnegative(),
		fault: z.enum(['timeout', 'refusal', 'garbage']),
		count: z.number().int().min(1).max(3).default(1)
	})
]);
export type Injection = z.infer<typeof injectionSchema>;
export type ProviderFault = Extract<Injection, { kind: 'provider-fault' }>;

/** Every kind but `provider-fault` is world content (WP72, `61-…` §2 item 2). */
export const isWorldInjection = (injection: Injection): boolean =>
	injection.kind !== 'provider-fault';

/** The world's injections and the session's faults, apart — a runner hands each to its owner. */
export function splitInjections(injections: readonly Injection[]): {
	world: Injection[];
	faults: ProviderFault[];
} {
	const world: Injection[] = [];
	const faults: ProviderFault[] = [];
	for (const injection of injections) {
		if (injection.kind === 'provider-fault') faults.push(injection);
		else world.push(injection);
	}
	return { world, faults };
}

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

/**
 * **A scenario template** (WP175, `112-REAL-ENOUGH-PLAN.md` §5; G154): a
 * scenario whose `draws` — which persona, which complication, which attack row,
 * which tick — are chosen from a seed, so one hand-written shape expands to a
 * scenario per seed with no writing. A template with no draws is a scenario;
 * the draw is deterministic in `(template, seed)`, so a campaign over a seed
 * range is reproducible. Each draw says what it chose in a `draw:<name>=<value>`
 * tag, so a report groups by it.
 */
export const scenarioDrawSchema = z.discriminatedUnion('kind', [
	/** One option per seed, by weight; each carries what it adds (tags and injections). */
	z.object({
		kind: z.literal('one-of'),
		name: z.string().min(1),
		options: z
			.array(
				z.object({
					id: z.string().min(1),
					weight: z.number().positive().default(1),
					tags: z.array(z.string()).default([]),
					injections: z.array(injectionSchema).default([])
				})
			)
			.min(1)
	}),
	/** An integer tick in `[min, max]`, set on the template's and the options' injections of the listed kinds. */
	z.object({
		kind: z.literal('tick-in'),
		name: z.string().min(1),
		min: z.number().int().nonnegative(),
		max: z.number().int().nonnegative(),
		applyTo: z.array(z.enum(['heard', 'provider-fault'])).min(1)
	})
]);
export type ScenarioDraw = z.infer<typeof scenarioDrawSchema>;

export const scenarioTemplateSchema = scenarioDefinitionSchema
	.extend({ draws: z.array(scenarioDrawSchema).default([]) })
	.superRefine((template, context) => {
		const seen = new Set<string>();
		for (const [index, draw] of template.draws.entries()) {
			if (seen.has(draw.name))
				context.addIssue({
					code: 'custom',
					path: ['draws', index, 'name'],
					message: `the draw "${draw.name}" is named twice`
				});
			seen.add(draw.name);
			if (draw.kind === 'tick-in' && draw.max < draw.min)
				context.addIssue({
					code: 'custom',
					path: ['draws', index],
					message: `the draw "${draw.name}" has a max below its min`
				});
		}
	});
export type ScenarioTemplate = z.infer<typeof scenarioTemplateSchema>;
export type ScenarioTemplateInput = z.input<typeof scenarioTemplateSchema>;

/** A small seeded stream (mulberry32): `core` holds no randomness of its own beyond this, and this is a pure function of the seed. */
function drawStream(seed: number, salt: string): () => number {
	let a =
		(seed ^ [...salt].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261)) >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * The scenario a template is at one seed: the template's own injections, then
 * each `one-of` draw's chosen option's, tags merged, ticks set; the id is
 * `<template>#<seed>`. Each draw has its own stream (salted by its name), so
 * adding a draw never changes what an earlier one chose.
 */
export function expandScenarioTemplate(
	template: ScenarioTemplate,
	seed: number
): ScenarioDefinition {
	const tags = [...template.tags];
	let injections: Injection[] = [...template.injections];
	const ticks: Array<{ kinds: readonly string[]; tick: number }> = [];
	for (const draw of template.draws) {
		const random = drawStream(seed, `${template.id}|${draw.name}`);
		if (draw.kind === 'one-of') {
			const total = draw.options.reduce((sum, option) => sum + option.weight, 0);
			let roll = random() * total;
			let chosen = draw.options[draw.options.length - 1]!;
			for (const option of draw.options) {
				roll -= option.weight;
				if (roll < 0) {
					chosen = option;
					break;
				}
			}
			tags.push(`draw:${draw.name}=${chosen.id}`, ...chosen.tags);
			injections = [...injections, ...chosen.injections];
		} else {
			const tick = draw.min + Math.floor(random() * (draw.max - draw.min + 1));
			tags.push(`draw:${draw.name}=${tick}`);
			ticks.push({ kinds: draw.applyTo, tick });
		}
	}
	injections = injections.map((injection) => {
		const set = ticks.filter((entry) => entry.kinds.includes(injection.kind));
		const last = set[set.length - 1];
		return last && (injection.kind === 'heard' || injection.kind === 'provider-fault')
			? { ...injection, atTick: last.tick }
			: injection;
	});
	return {
		...scenarioDefinitionSchema.parse({ ...template, draws: undefined }),
		id: `${template.id}#${seed}`,
		tags: [...new Set(tags)],
		injections
	};
}
