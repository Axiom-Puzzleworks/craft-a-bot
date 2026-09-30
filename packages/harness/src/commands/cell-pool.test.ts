import { describe, expect, it } from 'vitest';
import { createCellPool } from './cell-pool.js';

/**
 * **A pool whose workers cannot start** (WP119, `105-CORPORA.md` §8): the
 * pool rejects with the worker's own reason and ends its workers, so the
 * process exits rather than waiting on a worker that will never take a cell.
 * (Found when `experiment run --jobs` did not hand the workers `--config`.)
 */
describe('createCellPool', () => {
	it('rejects, and ends its workers, when a worker cannot start', async () => {
		const campaign = {
			schemaVersion: 1,
			id: 'nowhere',
			title: 'Nowhere',
			scenarios: [],
			source: { kind: 'book', workflowId: 'nobody/none', population: { seed: 1, size: 10 } },
			builds: [{ id: 'bot', base: { kind: 'starter-default' } }],
			guards: [{ id: 'none', fit: [] }],
			brains: [{ id: 'scripted-optimal', tier: 'scripted-optimal' }],
			seeds: [1],
			gates: [{ id: 'runs', require: { kind: 'outcome-rate', outcome: 'SUCCESS', atLeast: 1 } }]
		};
		await expect(
			createCellPool(2, { campaign, scenarioPacks: [], egress: 'none' } as Parameters<
				typeof createCellPool
			>[1])
		).rejects.toThrow(/a campaign worker could not start: .*"nobody\/none", which no pack ships/);
	}, 30_000);
});
