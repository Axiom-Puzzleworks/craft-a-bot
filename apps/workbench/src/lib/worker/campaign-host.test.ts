import { describe, expect, it } from 'vitest';
import { injectionBaseline, runCampaign } from '@craftabot/evals';
import { packs } from '$edition-packs';
import { workshopPlans } from '$lib/workshop/plans.js';
import { createCampaignHost } from './campaign-host.js';
import { CampaignCancelled, inProcessWorker, runCampaignIn } from './campaign-client.js';
import type { WorkerReply } from './protocol.js';

/**
 * **One runner, whichever host** (`65-DAY5-ROADMAP.md` WP77's DoD, `64-…`
 * §6.6.1's first test): the injection baseline run through the Worker's
 * protocol produces a report byte-identical to the main-thread run of
 * today. The clock and the report id are fixed on both sides, because they
 * are the only two things the runner draws from the wall.
 */
const FIXED = { now: '2026-09-10T00:00:00.000Z', reportId: 'report-fixed' };

const workerOf = () =>
	inProcessWorker((post) => createCampaignHost({ packs, plans: workshopPlans }, post));

describe('the campaign Worker host', () => {
	it('produces a report byte-identical to the main thread run', async () => {
		const campaign = injectionBaseline([1]);
		const direct = await runCampaign(campaign, {
			packs,
			plans: workshopPlans,
			now: () => FIXED.now,
			newId: () => FIXED.reportId
		});
		const traces: string[] = [];
		const progress: Array<[number, number]> = [];
		const viaWorker = await runCampaignIn(workerOf(), campaign, {
			fixed: FIXED,
			onProgress: (done, total) => progress.push([done, total]),
			onTrace: (cell) => traces.push(cell.runId ?? '')
		}).result;
		expect(JSON.stringify(viaWorker)).toBe(JSON.stringify(direct));
		expect(progress.at(-1)).toEqual([direct.cells.length, direct.cells.length]);
		expect(traces).toHaveLength(direct.cells.length);
	}, 60_000);

	it('cancels at the next cell boundary and reports how far it got', async () => {
		const worker = workerOf();
		let firstCell: (() => void) | undefined;
		const started = new Promise<void>((resolve) => (firstCell = resolve));
		const job = runCampaignIn(worker, injectionBaseline([1, 2]), {
			onProgress: () => firstCell?.()
		});
		await started;
		job.cancel();
		await expect(job.result).rejects.toBeInstanceOf(CampaignCancelled);
		const cancelled = (await job.result.catch((error: unknown) => error)) as CampaignCancelled;
		expect(cancelled.total).toBe(64);
		expect(cancelled.done).toBeGreaterThan(0);
		expect(cancelled.done).toBeLessThan(64);
	}, 60_000);

	it('refuses what is not a campaign, runs a book as the campaign it is, and says the bank runner is not built yet', async () => {
		const replies: WorkerReply[] = [];
		const host = createCampaignHost({ packs, plans: workshopPlans }, (reply) =>
			replies.push(reply)
		);
		host.handle({ kind: 'start', job: 'k', work: 'bank', bank: {} });
		expect(replies).toEqual([
			{ kind: 'failed', job: 'k', error: 'the bank runner is not built yet (WP83)' }
		]);
		// A book with no campaign in it fails as a campaign fails: parsed, refused, said (WP80).
		host.handle({ kind: 'start', job: 'b', work: 'book', book: {} });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(replies.at(-1)).toMatchObject({ kind: 'failed', job: 'b' });
		await expect(runCampaignIn(workerOf(), { not: 'a campaign' }).result).rejects.toThrow();
	});
});
