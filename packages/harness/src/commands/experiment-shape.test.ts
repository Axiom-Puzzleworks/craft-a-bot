import { describe, expect, it } from 'vitest';
// The CI script itself (WP90, `80-…` §4), tested where the harness's own tests run.
import { compareShape, shapeOf } from '../../../../scripts/experiment-shape.mjs';

const effect = (metricId: string, treatment: string, n = 10) => ({
	metricId,
	factor: { axis: 'guard', baseline: 'none', treatment },
	baseline: { n },
	treatment: { n }
});
const result = (effects: unknown[], verdict = 'inconclusive') => ({
	experimentId: 'x',
	effects,
	verdict,
	digest: 'a'.repeat(64)
});

describe('experiment-shape', () => {
	it('holds when the metrics, factors and levels match, whatever the values', () => {
		const committed = result([effect('agreement', 'stack'), effect('tokens', 'stack', 4000)]);
		const reduced = result(
			[effect('tokens', 'stack', 30), effect('agreement', 'stack', 30)],
			'supported'
		);
		expect(shapeOf(committed as never).effects).toEqual([
			'agreement|guard|none|stack',
			'tokens|guard|none|stack'
		]);
		expect(compareShape(committed as never, reduced as never)).toEqual([]);
	});

	it('names a missing effect, an extra one, an empty side, an odd verdict and a missing digest', () => {
		const committed = result([effect('agreement', 'stack')]);
		const reduced = {
			...result([effect('tokens', 'stack', 0)], 'maybe'),
			experimentId: 'y',
			digest: 'nope'
		};
		expect(compareShape(committed as never, reduced as never)).toEqual([
			'experiment id: x vs y',
			'effect missing from the reduced run: agreement|guard|none|stack',
			'effect the committed run lacks: tokens|guard|none|stack',
			'verdict not one of the three: maybe',
			'no cells on a side of tokens (stack)',
			'the reduced result carries no digest'
		]);
	});
});
