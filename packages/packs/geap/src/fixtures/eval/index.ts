/**
 * `evaluateInstances` response envelopes (`39-HOSTED-EVALUATOR.md` §4.1),
 * one per reading the evaluators must classify. Best-effort from the v1
 * discovery document's schema, as `25-…` §8 did for Model Armor; the smoke
 * test's evaluation leg is what checks them against a live answer.
 */
import failure from './failure.json' with { type: 'json' };
import fulfillmentHigh from './fulfillment-high.json' with { type: 'json' };
import fulfillmentLow from './fulfillment-low.json' with { type: 'json' };
import pointwise from './pointwise.json' with { type: 'json' };
import safetySafe from './safety-safe.json' with { type: 'json' };
import safetyUnsafe from './safety-unsafe.json' with { type: 'json' };

export const evalFixtures = {
	'safety-safe': safetySafe,
	'safety-unsafe': safetyUnsafe,
	'fulfillment-high': fulfillmentHigh,
	'fulfillment-low': fulfillmentLow,
	pointwise,
	failure
} as const;

export type EvalFixtureName = keyof typeof evalFixtures;
