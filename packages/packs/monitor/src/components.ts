import { z } from 'zod';
import { stampComponent, type GuardrailComponent } from '@craftabot/core';
import { createEvaluatorCircuitBreaker } from './rules.js';

/**
 * **The `evaluator-breaker` adapter** (WP94, `85-COMPONENTS.md` §5): an
 * evaluator with the labels or the failure that trip it, as a component at
 * the two-seat chokepoint (`group`, as WP64 installs it) or a stage
 * boundary (`stage-out`, WP95). It ships from this pack because the breaker
 * is the pack's, and `governance` cannot depend on a pack.
 */
export const EVALUATOR_BREAKER_COMPONENT_ID = 'monitor/evaluator-breaker';

export const evaluatorBreakerSchema = z
	.object({
		evaluatorId: z.string().min(1),
		labels: z.array(z.string().min(1)).optional(),
		onFail: z.boolean().optional()
	})
	.refine((config) => (config.labels?.length ?? 0) > 0 || config.onFail === true, {
		message: 'a breaker trips on a label or on failure; name one'
	});

export const evaluatorBreakerComponent: GuardrailComponent<z.infer<typeof evaluatorBreakerSchema>> =
	{
		id: EVALUATOR_BREAKER_COMPONENT_ID,
		name: 'Evaluator breaker',
		description:
			'Runs an evaluator over the trace so far and stops the moment it says one of the labels, or fails.',
		technique: 'circuit-breaker',
		points: ['group', 'stage-out'],
		verdicts: ['allow', 'stop-run'],
		cost: { class: 'local-compute', latency: 'local' },
		configSchema: evaluatorBreakerSchema,
		explain: (config) =>
			`Stops the moment ${config.evaluatorId} says ${[...(config.labels ?? []), ...(config.onFail ? ['fails'] : [])].join(' or ')}.`,
		compile: (config, deps, point) => {
			const evaluator = deps.getEvaluator(config.evaluatorId);
			if (!evaluator) throw new Error(`no evaluator '${config.evaluatorId}' is registered`);
			return stampComponent(
				[
					createEvaluatorCircuitBreaker(
						evaluator,
						{
							...(config.labels ? { labels: config.labels } : {}),
							...(config.onFail !== undefined ? { onFail: config.onFail } : {})
						},
						deps.fetch ? { fetch: deps.fetch } : {}
					)
				],
				EVALUATOR_BREAKER_COMPONENT_ID,
				point
			);
		}
	};
