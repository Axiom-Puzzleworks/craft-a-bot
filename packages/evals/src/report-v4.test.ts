import { describe, expect, it } from 'vitest';
import { renderCampaignScorecard } from './campaign-scorecard.js';
import {
	CAMPAIGN_REPORT_SCHEMA_VERSION,
	evaluateGate,
	pairIdOf,
	parseCampaignReport,
	sameReportInstrument,
	type CampaignCell,
	type CampaignReport
} from './campaign.js';

/**
 * **Report v4** (WP112, `101-DAY7-ROADMAP.md`): two identifiers on a cell —
 * the journey a book cell ran (`workflow.workflowId`) and the matched pair a
 * cell is one side of (`pairId`). A v3 report reads as v4 with them absent
 * and is the same instrument: a `no-regression` gate against it compares.
 */
const cell = (over: Partial<CampaignCell> = {}): CampaignCell => ({
	scenario: 's',
	build: 'b',
	guard: 'g',
	brain: 'scripted-optimal',
	tier: 'scripted-optimal',
	seed: 1,
	tags: [],
	outcome: 'SUCCESS',
	metrics: {
		outcome: 'SUCCESS',
		ticksUsed: 3,
		tokensIn: 10,
		tokensOut: 5,
		loop: { longestStreak: 1, repeatedFailures: 0 },
		wastedTickRatio: 0,
		namingMisses: 0,
		namingAmbiguities: 0,
		guardrailTrips: {},
		approvalsRequested: 0,
		approvalsDenied: 0
	},
	assertions: {},
	evaluations: {},
	labels: {},
	caseMetrics: {},
	...over
});

const report = (version: number, cells: CampaignCell[]): CampaignReport =>
	parseCampaignReport({
		schemaVersion: version,
		id: 'r',
		campaignId: 'c',
		campaignTitle: 'C',
		createdAt: '2026-09-29T00:00:00.000Z',
		packVersions: {},
		noise: { misname: 0.12, wastedMove: 0.12, prematureCelebrate: 0.04 },
		builds: [],
		cells,
		gates: [],
		passed: true,
		budget: { liveCells: 0, tokensIn: 0, tokensOut: 0, liveEvaluations: 0 }
	});

describe('report v4 (WP112)', () => {
	it('is version 4', () => {
		expect(CAMPAIGN_REPORT_SCHEMA_VERSION).toBe(4);
	});

	it('names a pair from truth’s pairSide: the same id for both sides, nothing without one', () => {
		const identity = { scenario: 'matched-pair', build: 'b', guard: 'g', brain: 'x' };
		const a = pairIdOf(identity, { facts: { pairSide: 'side-a' } });
		const b = pairIdOf(identity, { facts: { pairSide: 'side-b' } });
		expect(a).toBe('matched-pair|b|g|x');
		expect(b).toBe(a);
		expect(pairIdOf({ ...identity, context: 'case-file' }, { facts: { pairSide: 'side-a' } })).toBe(
			'matched-pair|b|g|x|case-file'
		);
		expect(pairIdOf(identity, { facts: { verdict: 'should-approve' } })).toBeUndefined();
		expect(pairIdOf(identity, undefined)).toBeUndefined();
	});

	it('a v3 report reads as v4 with the identifiers absent, keeps its version, and says nothing of missing panes', () => {
		const read = report(3, [cell()]);
		expect(read.schemaVersion).toBe(3);
		expect(read.cells[0]?.pairId).toBeUndefined();
		expect(renderCampaignScorecard(read)).not.toContain('written at schema v3');
	});

	it('a v4 cell keeps its pair id and its journey through a parse', () => {
		const read = report(4, [
			cell({
				pairId: 'p',
				workflow: {
					runId: 'w',
					workflowId: 'fs-disputes/disputes',
					outcome: 'completed',
					stages: [],
					touches: [],
					decisions: [],
					breaches: 0
				}
			})
		]);
		expect(read.cells[0]?.pairId).toBe('p');
		expect(read.cells[0]?.workflow?.workflowId).toBe('fs-disputes/disputes');
	});

	it('v3 and v4 are one instrument: a no-regression gate against a v3 baseline compares', () => {
		expect(sameReportInstrument(3, 4)).toBe(true);
		expect(sameReportInstrument(2, 4)).toBe(false);
		const verdict = evaluateGate(
			{ id: 'nr', require: { kind: 'no-regression', tolerance: 0 } },
			[cell()],
			report(3, [cell()])
		);
		expect(verdict.inconclusive).not.toBe(true);
		expect(verdict.passed).toBe(true);
	});
});
