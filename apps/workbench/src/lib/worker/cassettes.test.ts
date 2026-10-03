import {
	mergeProviderEntries,
	parseProviderCassette,
	recordingProvider,
	type ProviderCassetteEntry
} from '@craftabot/core';
import { createMockProvider } from '@craftabot/core/testing';
import {
	injectionBaseline,
	parseCampaign,
	runCampaign,
	scriptedOptimal,
	type CampaignReport
} from '@craftabot/evals';
import { packs } from '$edition-packs';
import { describe, expect, it } from 'vitest';
import { workshopPlans } from '$lib/workshop/plans.js';
import { createCampaignHost } from './campaign-host.js';
import { cassettePathsOf, loadCassettes } from './cassettes.js';
import { inProcessWorker, runCampaignIn } from './campaign-client.js';

/**
 * **A live brain replayed in the Worker** (WP172, D10): the page fetches the
 * cassettes a campaign's brains name from the edition and hands them to the
 * Worker, which replays them with no provider and no network, to the report
 * the main thread's runner gives. A cassette the edition does not serve is
 * an error that names its path.
 */
const CASSETTE = 'docs/evidence/one-seed/one-seed.provider-cassette.json';

function campaignOver(cassette?: string) {
	const base = injectionBaseline([1]) as Record<string, unknown> & { guards: unknown[] };
	return parseCampaign({
		...base,
		guards: base.guards.slice(0, 2),
		brains: [{ id: 'live', tier: 'live', ...(cassette ? { cassette } : {}) }],
		...(cassette ? {} : { budget: { maxLiveCells: 100 } })
	});
}

async function record() {
	const recordings: ProviderCassetteEntry[][] = [];
	await runCampaign(campaignOver(), {
		packs,
		plans: workshopPlans,
		providerFor: (_brain, context) => {
			const recording = recordingProvider(
				createMockProvider({
					script: scriptedOptimal(workshopPlans.planFor(context?.goalCardId ?? ''))
				})
			);
			recordings.push(recording.entries);
			return recording.provider;
		}
	});
	return parseProviderCassette({
		format: 'craftabot-cassette',
		formatVersion: 1,
		kind: 'provider',
		providerId: 'mock',
		recordedAt: '2026-10-03T12:00:00.000Z',
		recordedBy: 'cassettes.test',
		note: 'the injection baseline, one seed, recorded from the mock provider',
		egress: [],
		entries: mergeProviderEntries(recordings).entries
	});
}

const stripped = (report: CampaignReport) =>
	report.cells.map((cell) => ({ outcome: cell.outcome, brain: cell.brain, guard: cell.guard }));

describe('the live column in the Worker (WP172)', () => {
	it('names the cassettes a campaign’s brains ask for, once each', () => {
		expect(cassettePathsOf(campaignOver(CASSETTE))).toEqual([CASSETTE]);
		expect(cassettePathsOf(campaignOver())).toEqual([]);
		expect(cassettePathsOf(undefined)).toEqual([]);
	});

	it('fetches from the edition’s own folder and refuses what is not served or not a cassette', async () => {
		const cassette = await record();
		const urls: string[] = [];
		const served = async (url: string | URL | Request) => {
			urls.push(String(url));
			return new Response(JSON.stringify(cassette), { status: 200 });
		};
		const loaded = await loadCassettes(campaignOver(CASSETTE), '/workshop', served as typeof fetch);
		expect(urls).toEqual([`/workshop/cassettes/${CASSETTE}`]);
		expect(loaded[CASSETTE]?.entries.length).toBe(cassette.entries.length);
		await expect(
			loadCassettes(
				campaignOver(CASSETTE),
				'',
				(async () => new Response('', { status: 404 })) as typeof fetch
			)
		).rejects.toThrow(/is not served by this edition/);
		await expect(
			loadCassettes(
				campaignOver(CASSETTE),
				'',
				(async () => new Response('{"nope":1}', { status: 200 })) as typeof fetch
			)
		).rejects.toThrow(/is not a provider cassette/);
	}, 60_000);

	it('replays the handed cassette in the Worker to the main thread’s report, and refuses a live brain with none', async () => {
		const cassette = await record();
		const direct = await runCampaign(campaignOver(CASSETTE), {
			packs,
			plans: workshopPlans,
			cassetteFor: () => cassette
		});
		const worker = inProcessWorker((post) =>
			createCampaignHost({ packs, plans: workshopPlans }, post)
		);
		const inWorker = await runCampaignIn(worker, campaignOver(CASSETTE), {
			cassettes: { [CASSETTE]: JSON.parse(JSON.stringify(cassette)) }
		}).result;
		expect(stripped(inWorker)).toEqual(stripped(direct));
		expect(inWorker.cells.length).toBeGreaterThan(0);
		expect(inWorker.cells.every((cell) => cell.outcome !== 'ERROR')).toBe(true);
		// A live brain handed nothing is recorded as an error on every cell, never played by a stand-in.
		const none = await runCampaignIn(worker, campaignOver(CASSETTE)).result;
		expect(none.cells.every((cell) => cell.error !== undefined)).toBe(true);
	}, 120_000);
});
