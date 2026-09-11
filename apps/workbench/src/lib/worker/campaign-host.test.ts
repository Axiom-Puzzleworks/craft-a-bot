import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorkItem, WorkflowRun } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { injectionBaseline, runCampaign } from '@craftabot/evals';
import { packs } from '$edition-packs';
import { workshopPlans } from '$lib/workshop/plans.js';
import { createCampaignHost } from './campaign-host.js';
import {
	CampaignCancelled,
	inProcessWorker,
	runBankIn,
	runCampaignIn,
	runWhatIfIn
} from './campaign-client.js';
import type { WorkerReply } from './protocol.js';

/**
 * **One runner, whichever host** (`65-DAY5-ROADMAP.md` WP77's DoD, `64-…`
 * §6.6.1's first test): the injection baseline run through the Worker's
 * protocol produces a report byte-identical to the main-thread run of
 * today. The clock and the report id are fixed on both sides, because they
 * are the only two things the runner draws from the wall.
 */
const FIXED = { now: '2026-09-10T00:00:00.000Z', reportId: 'report-fixed' };

const HERE = dirname(fileURLToPath(import.meta.url));

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
		host.handle({
			kind: 'start',
			job: 'k',
			work: 'bank',
			bank: { population: { seed: 1, size: 10 }, from: '2026-01-05', to: '2026-01-05', desks: [] }
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(replies.at(-1)).toMatchObject({ kind: 'failed', job: 'k' });
		// A book with no campaign in it fails as a campaign fails: parsed, refused, said (WP80).
		host.handle({ kind: 'start', job: 'b', work: 'book', book: {} });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(replies.at(-1)).toMatchObject({ kind: 'failed', job: 'b' });
		await expect(runCampaignIn(workerOf(), { not: 'a campaign' }).result).rejects.toThrow();
	});
});

/**
 * **A day at the bank through the Worker** (WP83, `71-THE-CLOCK.md` §5): the
 * lending desk works the day's applications in the Worker; every agent
 * run arrives as a trace and the day as `bank-done` with its runs; the
 * `BankRun` is the same bytes as the scheduler makes on this thread.
 */
describe('the bank job', { timeout: 300_000 }, () => {
	it('runs a day at the lending desk, posts the traces and the BankRun, and is byte-identical to a second day', async () => {
		const job = {
			population: { seed: 1, size: 1_500 },
			from: '2026-06-10',
			to: '2026-06-19',
			desks: [
				{
					id: 'lending',
					workflowId: 'fs-lending/lending',
					kinds: ['application' as const],
					configuration: 'bot-everywhere',
					concurrency: 3
				}
			]
		};
		const traces: string[] = [];
		const arrivals: string[] = [];
		const landed: string[] = [];
		const first = await runBankIn(workerOf(), job, {
			onTrace: (cell) => traces.push(cell.scenario),
			onArrival: (arrival) => arrivals.push(`${arrival.desk ?? '-'}:${arrival.itemId}`),
			onWorkflowRun: (entry) => landed.push(`${entry.desk}:${entry.item.id}:${entry.events.length}`)
		}).result;
		// WP84: every arrival named its desk, every workflow run landed before the day did, its agent events attached.
		expect(arrivals).toHaveLength(first.bank.counts.arrivals['application'] ?? 0);
		expect(arrivals.every((entry) => entry.startsWith('lending:'))).toBe(true);
		expect(landed).toHaveLength(first.runs.length);
		expect(landed.every((entry) => entry.startsWith('lending:') && !entry.endsWith(':0'))).toBe(
			true
		);
		expect(first.bank.counts.arrivals['application']).toBeGreaterThan(0);
		expect(first.bank.counts.routed).toBe(first.runs.length);
		expect(first.runs.length).toBeGreaterThan(0);
		expect(traces.length).toBeGreaterThan(0);
		expect(traces.every((desk) => desk === 'lending')).toBe(true);
		const second = await runBankIn(workerOf(), job).result;
		expect(second.bank.digest).toBe(first.bank.digest);
		expect(JSON.stringify(second.bank)).toBe(
			JSON.stringify({ ...first.bank, wallMs: second.bank.wallMs })
		);
	});
});

/**
 * **A what-if through the Worker** (WP86, `77-PIPELINE-AND-BOUNDARY.md` §4):
 * the committed lending run re-run from the decision with the rule deciding
 * — the stages before the decision byte-equal to the original's (the
 * origin's config and seeds), the decision a rule's from there, every agent
 * run posted as a trace and returned with the run.
 */
describe('the what-if job', { timeout: 120_000 }, () => {
	it('re-runs a stored run from a stage under a changed executor, reproducing the stages before it', async () => {
		const stored = JSON.parse(
			readFileSync(
				join(
					HERE,
					'..',
					'..',
					'..',
					'..',
					'..',
					'packages',
					'packs',
					'fs-lending',
					'src',
					'fixtures',
					'lending-workflow-run.v1.json'
				),
				'utf8'
			)
		) as { run: WorkflowRun; item: WorkItem };
		const traces: string[] = [];
		const done = await runWhatIfIn(
			workerOf(),
			{
				workflowId: stored.run.workflowId,
				item: stored.item,
				from: stored.run,
				stageId: 'decision',
				executors: { decision: { kind: 'rule', rule: 'decision-v1' } }
			},
			{ onTrace: (cell) => traces.push(cell.scenario) }
		).result;
		expect(done.run.outcome).toBe('completed');
		const before = (run: WorkflowRun) =>
			run.stages.slice(
				0,
				run.stages.findIndex((stage) => stage.stageId === 'decision')
			);
		expect(before(done.run).map((stage) => stage.output.digest)).toEqual(
			before(stored.run).map((stage) => stage.output.digest)
		);
		expect(done.run.stages.find((stage) => stage.stageId === 'decision')?.executor).toEqual({
			kind: 'rule',
			rule: 'decision-v1'
		});
		expect(done.agentRuns.length).toBeGreaterThan(0);
		expect(traces.every((scenario) => scenario === 'what-if')).toBe(true);
		expect(done.item.id).toBe(stored.item.id);
	});
});
