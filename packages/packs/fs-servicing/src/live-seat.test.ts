import {
	mergeProviderEntries,
	parseProviderCassette,
	recordingProvider,
	type ProviderCassetteEntry
} from '@craftabot/core';
import { parseCampaign, runCampaign } from '@craftabot/evals';
import { createMockProvider, turn } from '@craftabot/core/testing';
import { scriptedOptimal } from '@craftabot/evals';
import fsBankPack from '@craftabot/pack-fs-bank';
import { describe, expect, it } from 'vitest';
import { servicingBookCampaign } from './campaign.js';
import fsServicingPack, { SERVICING_DESK_WORLD_ID } from './index.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';

/**
 * **The customer speaks in a book** (WP169, `112-REAL-ENOUGH-PLAN.md` §5): a book campaign
 * whose counterpart is `live` seats a second member at each agent stage whose case has a
 * person to seat. The seat here is a mock that says one thing and hangs up; the identity is
 * the scripted seat's — a campaign that names no live seat is the committed one.
 */
const packs = [fsBankPack, fsServicingPack];
const plans = { planFor, adversaryPlanFor };
const FIXED = { now: () => '2026-10-06T09:00:00.000Z', newId: () => 'report-1' };
const SAY = `${SERVICING_DESK_WORLD_ID}/say`;
const HANG_UP = `${SERVICING_DESK_WORLD_ID}/hang-up`;

const campaign = (extra: Record<string, unknown>) =>
	parseCampaign({
		...servicingBookCampaign({ size: 160, configurations: ['bot-everywhere'] }),
		...extra
	});

describe('a live customer in a book (WP169)', () => {
	it('seats the visitor at every item, writes each line as a seat.said, and fills the cell', async () => {
		const traces: Array<{ said: string[]; runs: Set<string> }> = [];
		const report = await runCampaign(
			campaign({
				counterpart: { tier: 'live', cartridgeId: 'starter/demo', maxRounds: 8 },
				budget: { maxLiveCells: 1000 }
			}),
			{
				packs,
				plans,
				providerFor: (brain) => {
					expect(brain).toMatchObject({ tier: 'live', cartridgeId: 'starter/demo' });
					return createMockProvider({
						id: 'mock-seat',
						script: [turn('Hello?', SAY, { text: 'I am still here.' }), turn('Bye.', HANG_UP)]
					});
				},
				onTrace: (_cell, trace) =>
					traces.push({
						said: trace.events.flatMap((event) =>
							event.type === 'seat.said' && event.payload.cue.kind === 'live'
								? [event.payload.text ?? '']
								: []
						),
						runs: new Set(trace.events.map((event) => event.runId))
					}),
				...FIXED
			}
		);
		expect(report.cells.find((cell) => cell.error)?.error).toBeUndefined();
		const seated = report.cells.filter((cell) => cell.counterpart !== undefined);
		expect(seated.length).toBeGreaterThan(0);
		for (const cell of seated) {
			expect(cell.counterpart).toMatchObject({ tier: 'live', cartridgeId: 'starter/demo' });
			expect(cell.counterpart?.runId).not.toBe(cell.runId);
		}
		expect(traces.some((trace) => trace.said.includes('I am still here.'))).toBe(true);
		// The agent's own trace carries the lines; the seat's run is its own.
		expect(traces.every((trace) => trace.runs.size >= 1)).toBe(true);
	});

	it('a campaign that names no live seat is the same campaign as before (the identity)', async () => {
		const plain = await runCampaign(campaign({}), { packs, plans, ...FIXED });
		const scripted = await runCampaign(campaign({ counterpart: { tier: 'scripted' } }), {
			packs,
			plans,
			...FIXED
		});
		expect(scripted.cells.map((cell) => [cell.outcome, cell.evaluations, cell.metrics])).toEqual(
			plain.cells.map((cell) => [cell.outcome, cell.evaluations, cell.metrics])
		);
		expect(plain.cells.every((cell) => cell.counterpart === undefined)).toBe(true);
	});

	it('what the customer said while recording is what the customer says on replay, from the one cassette', async () => {
		const recordings: ProviderCassetteEntry[][] = [];
		const live = (extra: Record<string, unknown>, brain: Record<string, unknown>) =>
			campaign({
				brains: [brain],
				counterpart: { tier: 'live', cartridgeId: 'starter/demo', maxRounds: 8 },
				...extra
			});
		const recorded = await runCampaign(
			live(
				{ budget: { maxLiveCells: 1000 } },
				{ id: 'live', tier: 'live', cartridgeId: 'starter/demo' }
			),
			{
				packs,
				plans,
				// The agent's calls come with a goal card; the seat's do not.
				providerFor: (_brain, context) => {
					const recording = recordingProvider(
						context?.goalCardId !== undefined
							? createMockProvider({ script: scriptedOptimal(planFor(context.goalCardId)) })
							: createMockProvider({
									script: [turn('Hello?', SAY, { text: 'I am still here.' }), turn('Bye.', HANG_UP)]
								})
					);
					recordings.push(recording.entries);
					return recording.provider;
				},
				...FIXED
			}
		);
		const cassette = parseProviderCassette({
			format: 'craftabot-cassette',
			formatVersion: 1,
			kind: 'provider',
			providerId: 'mock',
			recordedAt: '2026-10-06T09:00:00.000Z',
			recordedBy: 'live-seat.test',
			note: 'a servicing book, its customer in the seat, recorded from mocks',
			egress: [],
			entries: mergeProviderEntries(recordings).entries
		});
		const replayed = await runCampaign(
			live({}, { id: 'live', tier: 'live', cartridgeId: 'starter/demo', cassette: 'the.json' }),
			{ packs, plans, cassetteFor: () => cassette, ...FIXED }
		);
		expect(replayed.cells.find((cell) => cell.error)?.error).toBeUndefined();
		expect(
			replayed.cells.map((cell) => [cell.outcome, cell.evaluations, cell.counterpart?.name])
		).toEqual(
			recorded.cells.map((cell) => [cell.outcome, cell.evaluations, cell.counterpart?.name])
		);
		expect(replayed.cells.every((cell) => cell.counterpart !== undefined)).toBe(true);
	});
});
