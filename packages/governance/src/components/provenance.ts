import { z } from 'zod';
import { stampComponent, type Guardrail, type GuardrailComponent } from '@craftabot/core';
import { createNoProgressGuardrail } from '../guardrails/no-progress.js';
import { untrustedNotebookWrites } from '../memory-provenance.js';

/**
 * **Two of the unbuilt techniques** (WP141, `110-CONTROL-SUITE-PLAN.md`
 * §10): the no-progress detector at `pre-act`, and memory provenance at
 * `pre-think`. Both read the trace and nothing else.
 */
const FREE = { class: 'free', latency: 'none' } as const;

/** The no-progress component’s id (WP141). */
export const NO_PROGRESS_COMPONENT_ID = 'governance/no-progress';
/** The memory-provenance component’s id (WP141). */
export const MEMORY_PROVENANCE_COMPONENT_ID = 'governance/memory-provenance';

/** The no-progress component's config. */
export const noProgressSchema = z.object({
	/** How many turns in a row may change nothing before the run stops. */
	turns: z.number().int().positive().default(6)
});

/** Stops a run whose world has not moved for N turns, whatever the bot tried (WP141). */
export const noProgressComponent: GuardrailComponent<z.input<typeof noProgressSchema>> = {
	id: NO_PROGRESS_COMPONENT_ID,
	name: 'No-progress detector',
	description:
		'Stops the run when several turns in a row have changed nothing in the world — the loop of different calls the loop-breaker cannot see.',
	technique: 'loop-detection',
	points: ['pre-act'],
	verdicts: ['allow', 'stop-run'],
	cost: FREE,
	configSchema: noProgressSchema,
	explain: (config) =>
		`Stops the run after ${noProgressSchema.parse(config).turns} turns in a row that change nothing.`,
	compile: (config, deps, point) =>
		stampComponent(
			[
				createNoProgressGuardrail(noProgressSchema.parse(config).turns, {
					isProgress: (name) => deps.getAction(name)?.progress === true
				})
			],
			NO_PROGRESS_COMPONENT_ID,
			point
		)
};

/** The memory-provenance component's config. */
export const memoryProvenanceSchema = z.object({
	/** `stop-run` refuses the think; `annotate` lets it through and says so on the trace. */
	verdict: z.enum(['stop-run', 'annotate']).default('stop-run')
});

/**
 * Refuses a think over a notebook that holds a line written under an
 * untrusted context (WP141): the source tag is on `memory.updated`, and a
 * card can read the same thing with the `memory-is-untrusted` leaf.
 */
export const memoryProvenanceComponent: GuardrailComponent<z.input<typeof memoryProvenanceSchema>> =
	{
		id: MEMORY_PROVENANCE_COMPONENT_ID,
		name: 'Memory provenance',
		description:
			'Refuses a turn whose notebook holds a line the bot wrote after reading untrusted content — the poisoned memory that outlives the tool result.',
		technique: 'memory-provenance',
		points: ['pre-think'],
		verdicts: ['allow', 'stop-run', 'annotate'],
		cost: FREE,
		configSchema: memoryProvenanceSchema,
		explain: (config) =>
			memoryProvenanceSchema.parse(config).verdict === 'stop-run'
				? 'Stops the run before a turn that would think over an untrusted notebook line.'
				: 'Notes on the trace each turn that thinks over an untrusted notebook line.',
		compile: (config, _deps, point) => {
			const { verdict } = memoryProvenanceSchema.parse(config);
			const guardrail: Guardrail = {
				id: MEMORY_PROVENANCE_COMPONENT_ID,
				name: 'Memory provenance',
				description: 'Refuses a think over a notebook line written under an untrusted context.',
				hooks: ['pre-think'],
				check: (ctx) => {
					const ticks = untrustedNotebookWrites(ctx.history);
					if (ticks.length === 0) return { allow: true };
					const label = `notebook written under untrusted content at tick ${ticks.join(', ')}`;
					return verdict === 'annotate'
						? {
								allow: true,
								verdictKind: 'annotate',
								finding: { category: 'untrusted-content', label }
							}
						: {
								allow: false,
								reason: `The notebook holds a line written after the bot read untrusted content (${label}). The run stops before it reasons over it.`,
								disposition: 'stop-run'
							};
				}
			};
			return stampComponent([guardrail], MEMORY_PROVENANCE_COMPONENT_ID, point);
		}
	};

/** The two the starter pack registers beside the built-ins. */
export const provenanceComponents = [noProgressComponent, memoryProvenanceComponent] as const;
