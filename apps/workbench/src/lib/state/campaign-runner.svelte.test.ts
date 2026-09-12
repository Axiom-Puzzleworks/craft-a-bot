import type { StoredWorkflowRun } from '@craftabot/core';
import { lendingBookCampaign } from '@craftabot/pack-fs-lending';
import { describe, expect, it } from 'vitest';
import { injectionBaseline, type CampaignReport } from '@craftabot/evals';
import { packs } from '$edition-packs';
import { workshopPlans } from '$lib/workshop/plans.js';
import { createCampaignHost } from '$lib/worker/campaign-host.js';
import { inProcessWorker } from '$lib/worker/campaign-client.js';
import { createCampaignRunner } from './campaign-runner.svelte.js';

/**
 * The runner store's promises (WP77): a queue drains one at a time, a
 * finished report is persisted before it is shown, a cancelled run stores
 * nothing, and a live brain is refused at the door as the page refused it.
 */
const spawn = () =>
	inProcessWorker((post) => createCampaignHost({ packs, plans: workshopPlans }, post));

const settled = (runner: ReturnType<typeof createCampaignRunner>) =>
	new Promise<void>((resolve) => {
		const tick = () => {
			if (!runner.running && runner.queue.every((entry) => entry.status !== 'queued')) resolve();
			else setTimeout(tick, 20);
		};
		tick();
	});

describe('the campaign runner store', () => {
	it('queues two campaigns, runs them in order, and persists each report as it lands', async () => {
		const persisted: CampaignReport[] = [];
		const runner = createCampaignRunner({
			spawn,
			persist: async (report) => {
				persisted.push(report);
			}
		});
		const first = runner.enqueue(injectionBaseline([1]));
		const second = runner.enqueue({ ...injectionBaseline([2]), id: 'second' });
		expect(typeof first).toBe('object');
		expect(typeof second).toBe('object');
		expect(runner.queue.map((entry) => entry.status)).toEqual(['running', 'queued']);
		await settled(runner);
		expect(runner.queue.map((entry) => entry.status)).toEqual(['done', 'done']);
		expect(persisted.map((report) => report.campaignId)).toEqual(['injection-baseline', 'second']);
		expect(runner.report?.campaignId).toBe('second');
		expect(Object.keys(runner.traces)).toHaveLength(32);
	}, 90_000);

	it('cancels the running campaign, stores nothing for it, and goes on to the next', async () => {
		const persisted: CampaignReport[] = [];
		const runner = createCampaignRunner({
			spawn,
			persist: async (report) => {
				persisted.push(report);
			}
		});
		runner.enqueue(injectionBaseline([1, 2, 3]));
		runner.enqueue({ ...injectionBaseline([4]), id: 'after' });
		await new Promise<void>((resolve) => {
			const tick = () => (runner.progress.done > 0 ? resolve() : setTimeout(tick, 10));
			tick();
		});
		runner.cancel();
		expect(runner.cancelRequested).toBe(true);
		await settled(runner);
		expect(runner.queue.map((entry) => entry.status)).toEqual(['cancelled', 'done']);
		expect(persisted.map((report) => report.campaignId)).toEqual(['after']);
	}, 90_000);

	it('refuses a live brain and a non-campaign with the reason', () => {
		const runner = createCampaignRunner({ spawn, persist: async () => {} });
		const live = injectionBaseline([1]);
		live.brains.push({ id: 'live', tier: 'live', cartridgeId: 'openai/gpt' } as never);
		expect(runner.enqueue(live)).toBe(
			'a campaign with a live brain runs from the harness, not here'
		);
		expect(typeof runner.enqueue({})).toBe('string');
		expect(runner.queue).toEqual([]);
	});
});

/** A book's workflow runs reach the store with their agent runs (WP86, `77-…` §3), one per cell, each with its item. */
describe('the campaign runner and the Pipeline', () => {
	it('persists every book cell’s workflow run with its item and agent runs', async () => {
		const stored: StoredWorkflowRun[] = [];
		const agentRunCounts: number[] = [];
		const runner = createCampaignRunner({
			spawn,
			persist: async () => {},
			persistWorkflowRun: async (record, agentRuns) => {
				stored.push(record);
				agentRunCounts.push(agentRuns.length);
			}
		});
		runner.enqueue(lendingBookCampaign({ size: 60, configurations: ['bot-everywhere'] }));
		await settled(runner);
		expect(runner.queue.map((entry) => entry.status)).toEqual(['done']);
		expect(stored.length).toBe(runner.report?.cells.length);
		expect(stored.length).toBeGreaterThan(0);
		for (const record of stored) {
			expect(record.item?.id).toBe(record.run.itemId);
			expect(record.source).toMatchObject({ kind: 'campaign', build: 'bot-everywhere' });
		}
		expect(agentRunCounts.every((count) => count > 0)).toBe(true);
	}, 120_000);
});
