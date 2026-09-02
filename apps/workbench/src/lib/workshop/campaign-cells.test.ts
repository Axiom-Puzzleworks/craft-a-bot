import { describe, expect, it } from 'vitest';
import { injectionBaseline, runCampaign, type CampaignReport } from '@craftabot/evals';
import {
	envelopeFor,
	recordForCampaignCell,
	reportFrom,
	sliceId,
	slicesOf
} from './campaign-cells.js';

const clock = () => {
	let calls = 0;
	return () => new Date(Date.UTC(2026, 8, 2, 12, 0, calls++)).toISOString();
};

let cached:
	Promise<{ report: CampaignReport; traces: Map<string, { events: never[] }> }> | undefined;
async function baselineReport() {
	cached ??= (async () => {
		const traces = new Map();
		const report = await runCampaign(injectionBaseline([1]), {
			now: clock(),
			newId: () => '00000000-0000-4000-8000-00000000c0de',
			onTrace: (cell, trace) => cell.runId && traces.set(cell.runId, trace)
		});
		return { report, traces };
	})();
	return cached;
}

describe('the campaign envelope', () => {
	it('carries what a list shows, and the report comes back out validated', async () => {
		const { report } = await baselineReport();
		const stored = envelopeFor(report);
		expect(stored).toMatchObject({
			campaignId: 'injection-baseline',
			passed: true,
			gatesPassed: 13,
			gatesTotal: 13,
			cells: 16,
			schemaVersion: 1
		});
		expect(reportFrom(stored)).toEqual(report);
		expect(reportFrom({ ...stored, report: { nonsense: true } })).toBeUndefined();
	});
});

describe('slices', () => {
	it('groups cells scenario × guard × brain in run order, with success and assertion rates', async () => {
		const { report } = await baselineReport();
		const slices = slicesOf(report);
		expect(slices).toHaveLength(16);
		expect(slices[0]).toMatchObject({
			scenario: 'warning-sign',
			guard: 'none',
			brain: 'scripted-optimal',
			successRate: 1
		});
		const leak = slices.find(
			(s) =>
				s.scenario === 'keep-the-secret' && s.guard === 'none' && s.brain === 'scripted-adversary'
		)!;
		expect(leak.assertionPassRates['campaign/never-says-the-code']).toBe(0);
		const held = slices.find(
			(s) =>
				s.scenario === 'keep-the-secret' &&
				s.guard === 'policy-card' &&
				s.brain === 'scripted-adversary'
		)!;
		expect(held.assertionPassRates['campaign/never-says-the-code']).toBe(1);
		expect(sliceId(leak)).toBe('keep-the-secret-none-scripted-adversary');
	});
});

describe('a drilled cell', () => {
	it('becomes a run record named for its cell, from its own trace', async () => {
		const { report, traces } = await baselineReport();
		const cell = report.cells[0]!;
		const trace = traces.get(cell.runId!) as unknown as {
			events: Parameters<typeof recordForCampaignCell>[1];
			spec: Parameters<typeof recordForCampaignCell>[2];
		};
		const record = recordForCampaignCell(cell, trace.events, trace.spec)!;
		expect(record.id).toBe(cell.runId);
		expect(record.agentName).toBe('campaign · warning-sign · none · scripted-optimal · seed 1');
		expect(record.goalCardId).toBe('starter/warning-sign');
		expect(record.outcome).toBe('SUCCESS');
		expect(record.schemaVersion).toBe(2);
		expect(
			recordForCampaignCell({ ...cell, runId: undefined }, trace.events, trace.spec)
		).toBeUndefined();
	});
});
