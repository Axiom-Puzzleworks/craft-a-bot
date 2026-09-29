import { describe, expect, it, vi } from 'vitest';
import {
	computeTraceDigest,
	mergeProviderEntries,
	parseProviderCassette,
	recordingProvider,
	type EngineEvent,
	type ProviderCassetteEntry,
	type ProviderCassetteFile
} from '@craftabot/core';
import { createMockProvider } from '@craftabot/core/testing';
import azureContentSafetyPack from '@craftabot/pack-azure-content-safety';
import guardLocalPack from '@craftabot/pack-guard-local';
import workshopPack from '@craftabot/pack-workshop';
import { injectionBaseline } from './baseline-campaign.js';
import { scriptedOptimal } from './brains.js';
import { parseCampaign, runCampaign, type Campaign } from './campaign.js';
import { starterPlans } from './plans.js';

/**
 * **A live brain from a provider cassette** (WP114, `103-FALLIBLE-ACTORS.md`
 * §3–§4): a campaign's live cells recorded through a provider — the mock
 * here, a real one under `craftabot record --experiment` — and replayed from
 * the cassette with no provider, no key and no network; every cell's trace
 * the recording's, byte for byte; a cassette brain costs no budget; a brain
 * that names a cassette with no loader, or a cassette on a scripted tier, is
 * refused.
 */
const packs = [workshopPack, guardLocalPack, azureContentSafetyPack];
const clock = () => {
	let calls = 0;
	return () => new Date(Date.UTC(2026, 8, 29, 12, 0, calls++)).toISOString();
};
const ids = () => {
	let n = 0;
	return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
};

function withBrain(brain: Record<string, unknown>, budget = false): Campaign {
	const base = injectionBaseline([1]) as Record<string, unknown> & { guards: unknown[] };
	return parseCampaign({
		...base,
		guards: base.guards.slice(0, 2),
		brains: [brain],
		...(budget ? { budget: { maxLiveCells: 100 } } : {})
	});
}

/**
 * The trace without its one wall-clock reading: `tool.executed.durationMs` is
 * timed by the session with the real clock (`agent-session.ts`), so it can read
 * 0 on one run and 1 on the next whatever the brain did. Everything else is
 * compared byte for byte (`103-…` §7).
 */
function wallClockFree(events: readonly EngineEvent[]): EngineEvent[] {
	return events.map((event) =>
		event.type === 'tool.executed'
			? ({ ...event, payload: { ...event.payload, durationMs: 0 } } as EngineEvent)
			: event
	);
}

async function digests(campaign: Campaign, options: Parameters<typeof runCampaign>[1]) {
	const byOrdinal = new Map<number, string>();
	const pending: Promise<void>[] = [];
	const report = await runCampaign(campaign, {
		...options,
		packs,
		now: clock(),
		newId: ids(),
		onTrace: (cell, { events }) => {
			pending.push(
				computeTraceDigest(wallClockFree(events as EngineEvent[])).then((digest) => {
					byOrdinal.set(cell.ordinal ?? -1, digest);
				})
			);
		}
	});
	await Promise.all(pending);
	return { report, byOrdinal };
}

describe('a live brain from a provider cassette (WP114)', () => {
	it('replays every cell of a recording to the recording’s trace, with no provider and no network', async () => {
		const recordings: ProviderCassetteEntry[][] = [];
		const recorded = await digests(withBrain({ id: 'live', tier: 'live' }, true), {
			providerFor: (_brain, context) => {
				const recording = recordingProvider(
					createMockProvider({
						script: scriptedOptimal(starterPlans.planFor(context?.goalCardId ?? ''))
					})
				);
				recordings.push(recording.entries);
				return recording.provider;
			}
		});
		const merged = mergeProviderEntries(recordings);
		expect(merged.conflicts).toBe(0);
		const cassette: ProviderCassetteFile = parseProviderCassette({
			format: 'craftabot-cassette',
			formatVersion: 1,
			kind: 'provider',
			providerId: 'mock',
			recordedAt: '2026-09-29T12:00:00.000Z',
			recordedBy: 'provider-cassette-campaign.test',
			note: 'the injection baseline, one seed, recorded from the mock provider',
			egress: [],
			entries: merged.entries
		});

		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		try {
			const replayed = await digests(
				withBrain({ id: 'live', tier: 'live', cassette: 'the.json' }),
				{
					cassetteFor: (path) => {
						expect(path).toBe('the.json');
						return cassette;
					}
				}
			);
			expect(fetch).not.toHaveBeenCalled();
			expect(recorded.report.cells.every((cell) => cell.error === undefined)).toBe(true);
			expect(replayed.report.cells.every((cell) => cell.error === undefined)).toBe(true);
			expect(replayed.report.cells.map((cell) => cell.outcome)).toEqual(
				recorded.report.cells.map((cell) => cell.outcome)
			);
			expect(replayed.byOrdinal.size).toBe(recorded.byOrdinal.size);
			for (const [ordinal, digest] of recorded.byOrdinal)
				expect(replayed.byOrdinal.get(ordinal), `cell ${ordinal}`).toBe(digest);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('a cassette brain needs no budget; a live brain without one still does', () => {
		expect(() => withBrain({ id: 'live', tier: 'live', cassette: 'x.json' })).not.toThrow();
		// Parsing accepts a live brain without a budget; the runner refuses it before any cell runs.
		return expect(runCampaign(withBrain({ id: 'live', tier: 'live' }), { packs })).rejects.toThrow(
			/no budget/
		);
	});

	it('refuses a cassette on a scripted tier, and a cassette brain with no loader', async () => {
		expect(() => withBrain({ id: 'x', tier: 'scripted-optimal', cassette: 'x.json' })).toThrow(
			/only a live brain replays a cassette/
		);
		const report = await runCampaign(withBrain({ id: 'live', tier: 'live', cassette: 'x.json' }), {
			packs
		});
		expect(report.cells[0]?.error).toMatch(/no cassetteFor was supplied/);
	});
});
