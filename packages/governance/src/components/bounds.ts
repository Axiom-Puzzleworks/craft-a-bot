import { z } from 'zod';
import { stampComponent, type Guardrail, type GuardrailComponent } from '@craftabot/core';

/**
 * **Two bounds** (WP148, `110-CONTROL-SUITE-PLAN.md` §10): a cap on what a
 * run spends in money, and a proposed call's arguments checked against the
 * schema the world declares for it — the refusal the world would make,
 * made a verdict on the trace before the world sees the call.
 */
const FREE = { class: 'free', latency: 'none' } as const;

/** The cost-cap component's id (WP148). */
export const COST_CAP_COMPONENT_ID = 'governance/cost-cap';
/** The tool-argument-validation component's id (WP148). */
export const ARGUMENT_VALIDATION_COMPONENT_ID = 'governance/tool-argument-validation';

/** The cost cap's config: the cap, and the list prices it is computed at, with where they came from. */
export const costCapSchema = z.object({
	/** The most the run may spend, in US dollars. */
	usdCap: z.number().positive(),
	/** The list price per million input and output tokens, as the provider publishes it. */
	inputPerMillion: z.number().nonnegative(),
	outputPerMillion: z.number().nonnegative(),
	/** Where the prices come from; a price enters with its source. */
	priceSource: z.string().min(1)
});

/** What a run has spent at the stated prices. */
export function spentUsd(
	usage: { inputTokens: number; outputTokens: number },
	prices: { inputPerMillion: number; outputPerMillion: number }
): number {
	return (
		(usage.inputTokens / 1_000_000) * prices.inputPerMillion +
		(usage.outputTokens / 1_000_000) * prices.outputPerMillion
	);
}

/** Stops a run before the turn that would think past its cap in money (WP148). */
export const costCapComponent: GuardrailComponent<z.input<typeof costCapSchema>> = {
	id: COST_CAP_COMPONENT_ID,
	name: 'Cost cap',
	description:
		'Stops the run before a turn once its tokens, at the provider’s list price, have spent the cap in money.',
	technique: 'cost-cap',
	points: ['pre-think'],
	verdicts: ['allow', 'stop-run'],
	cost: FREE,
	configSchema: costCapSchema,
	explain: (config) => {
		const parsed = costCapSchema.parse(config);
		return `Stops the run at $${parsed.usdCap.toFixed(2)}, at $${parsed.inputPerMillion}/$${parsed.outputPerMillion} per million tokens in and out (${parsed.priceSource}).`;
	},
	compile: (config, _deps, point) => {
		const parsed = costCapSchema.parse(config);
		const guardrail: Guardrail = {
			id: COST_CAP_COMPONENT_ID,
			name: 'Cost cap',
			description: `Stops the run at $${parsed.usdCap.toFixed(2)}.`,
			hooks: ['pre-think'],
			check: (ctx) => {
				const spent = spentUsd(ctx.usage, parsed);
				if (spent < parsed.usdCap)
					return { allow: true, note: `$${spent.toFixed(4)} of $${parsed.usdCap.toFixed(2)}` };
				return {
					allow: false,
					reason: `The run has spent $${spent.toFixed(4)} of its $${parsed.usdCap.toFixed(2)} cap at ${parsed.priceSource}'s prices.`,
					disposition: 'stop-run'
				};
			}
		};
		return stampComponent([guardrail], COST_CAP_COMPONENT_ID, point);
	}
};

type Schema = {
	type?: string | string[];
	required?: string[];
	properties?: Record<string, Schema>;
	enum?: unknown[];
	items?: Schema;
};

const typeOf = (value: unknown): string =>
	Array.isArray(value)
		? 'array'
		: value === null
			? 'null'
			: typeof value === 'number' && Number.isInteger(value)
				? 'integer'
				: typeof value;

/**
 * The problems a value has against a JSON Schema's common core — `type`,
 * `required`, `properties`, `enum`, `items` — each with its path. What the
 * desks and the Playroom declare; a keyword outside the core is not checked.
 */
export function argumentProblems(value: unknown, schema: Schema, path = 'arguments'): string[] {
	const problems: string[] = [];
	if (schema.type !== undefined) {
		const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
		const actual = typeOf(value);
		const fits = allowed.some(
			(type) => type === actual || (type === 'number' && actual === 'integer')
		);
		if (!fits)
			return [
				`${path} is ${actual === 'integer' ? 'number' : actual}, not ${allowed.join(' or ')}`
			];
	}
	if (
		schema.enum &&
		!schema.enum.some((option) => JSON.stringify(option) === JSON.stringify(value))
	)
		problems.push(
			`${path} is not one of ${schema.enum.map((option) => JSON.stringify(option)).join(', ')}`
		);
	if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
		const record = value as Record<string, unknown>;
		for (const key of schema.required ?? [])
			if (record[key] === undefined) problems.push(`${path}.${key} is missing`);
		for (const [key, inner] of Object.entries(schema.properties ?? {}))
			if (record[key] !== undefined)
				problems.push(...argumentProblems(record[key], inner, `${path}.${key}`));
	}
	if (Array.isArray(value) && schema.items)
		value.forEach((item, index) =>
			problems.push(...argumentProblems(item, schema.items!, `${path}[${index}]`))
		);
	return problems;
}

/** Blocks a proposed world action whose arguments do not fit the schema the world declares for it (WP148). */
export const argumentValidationComponent: GuardrailComponent<Record<string, never>> = {
	id: ARGUMENT_VALIDATION_COMPONENT_ID,
	name: 'Tool-argument validation',
	description:
		'Checks a proposed action’s arguments against the schema its world declares, and refuses one that does not fit before the world sees it.',
	technique: 'tool-argument-validation',
	points: ['pre-act'],
	verdicts: ['allow', 'block-action'],
	cost: FREE,
	configSchema: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
	explain: () => 'Refuses an action whose arguments do not fit its declared schema.',
	compile: (_config, deps, point) => {
		const guardrail: Guardrail = {
			id: ARGUMENT_VALIDATION_COMPONENT_ID,
			name: 'Tool-argument validation',
			description: 'Checks a proposed action’s arguments against its declared schema.',
			hooks: ['pre-act'],
			check: (ctx) => {
				const proposed = ctx.proposed;
				if (!proposed || proposed.kind !== 'action') return { allow: true };
				const action = deps.getAction(proposed.name);
				if (!action?.parameters) return { allow: true };
				const problems = argumentProblems(proposed.arguments ?? {}, action.parameters as Schema);
				if (problems.length === 0) return { allow: true };
				return {
					allow: false,
					reason: `${proposed.name}'s arguments do not fit its schema: ${problems.join('; ')}.`,
					disposition: 'block-action'
				};
			}
		};
		return stampComponent([guardrail], ARGUMENT_VALIDATION_COMPONENT_ID, point);
	}
};

/** The two the starter pack registers beside the built-ins. */
export const boundsComponents = [costCapComponent, argumentValidationComponent] as const;
