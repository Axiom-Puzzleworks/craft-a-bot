import { contextSpecFor } from '@craftabot/core';
import workshopPack from '@craftabot/pack-workshop';
import { planFor as workshopPlanFor } from '@craftabot/pack-workshop/testing';
import { describe, expect, it } from 'vitest';
import { renderCampaignScorecard } from './campaign-scorecard.js';
import {
	campaignCells,
	evaluateGate,
	parseCampaign,
	runCampaign,
	type Campaign
} from './campaign.js';
import { chainPlans, noPlans, starterPlans } from './plans.js';

/**
 * **The context ladder as a campaign axis** (WP81, `70-…` §6): every cell
 * runs once per rung named; the cells, the slices and the case rows carry
 * the rung; a gate selects on it; a campaign with no `contexts` writes no
 * `context` anywhere, so it is byte-identical to before.
 */
const CARD = 'workshop/sign-the-visitor-in';
const plans = chainPlans(starterPlans, {
	planFor: workshopPlanFor,
	adversaryPlanFor: noPlans('adversarial')
});
const FIXED = { now: () => '2026-09-11T09:00:00.000Z', newId: () => 'report-context' };

function campaign(over: Partial<Campaign> = {}): Campaign {
	return parseCampaign({
		schemaVersion: 1,
		id: 'test/front-desk-contexts',
		title: 'The Front Desk across the ladder',
		scenarios: [{ id: 'sign-in', goalCardId: CARD, maxTicks: 8 }],
		builds: [
			{
				id: 'clerk',
				base: { kind: 'starter-default' },
				overrides: {
					senses: [
						'workshop/the-desk/conversation',
						'workshop/the-desk/case-file',
						'workshop/the-desk/queue'
					],
					actions: [
						'workshop/the-desk/say',
						'workshop/the-desk/look-up',
						'workshop/the-desk/sign-in',
						'workshop/the-desk/decide'
					]
				}
			}
		],
		guards: [{ id: 'none', fit: [] }],
		brains: [{ id: 'scripted-optimal', tier: 'scripted-optimal' }],
		seeds: [1, 2],
		assertionCards: [],
		evaluators: [],
		gates: [{ id: 'finishes', require: { kind: 'outcome-rate', outcome: 'SUCCESS', atLeast: 0 } }],
		...over
	});
}

describe('contexts as an axis', () => {
	it('multiplies the cells by the rungs, and the report carries the rung on cells, slices and cases', async () => {
		const two = campaign({ contexts: [contextSpecFor('minimal'), contextSpecFor('case-file')] });
		expect(campaignCells(two)).toHaveLength(4);
		expect(campaignCells(two).map((cell) => cell.context?.id)).toEqual([
			'minimal',
			'minimal',
			'case-file',
			'case-file'
		]);
		const report = await runCampaign(two, { packs: [workshopPack], plans, ...FIXED });
		expect(report.cells.map((cell) => cell.context)).toEqual([
			'minimal',
			'minimal',
			'case-file',
			'case-file'
		]);
		expect(report.cells.every((cell) => cell.error === undefined)).toBe(true);
		expect(report.summary?.slices.map((slice) => slice.context)).toEqual(['minimal', 'case-file']);
		expect(report.summary?.cases.map((row) => row.context)).toEqual([
			'minimal',
			'minimal',
			'case-file',
			'case-file'
		]);
		const scorecard = renderCampaignScorecard(report);
		expect(scorecard).toContain('sign-in · minimal');
		expect(scorecard).toContain('sign-in · case-file');
		// A gate selects on the rung.
		const gate = evaluateGate(
			{
				id: 'minimal-finishes',
				where: { context: 'minimal' },
				require: { kind: 'outcome-rate', outcome: 'SUCCESS', atLeast: 0 }
			},
			report.cells
		);
		expect(gate.cells).toBe(2);
		// The minimal rung opens with fewer records on the desk than the case file does.
		const opening = (cell: (typeof report.cells)[number]) => cell.metrics;
		expect(opening(report.cells[0]!)).toBeDefined();
	});

	it('a campaign without contexts writes no context anywhere', async () => {
		const plain = campaign();
		expect(campaignCells(plain)).toHaveLength(2);
		const report = await runCampaign(plain, { packs: [workshopPack], plans, ...FIXED });
		expect(JSON.stringify(report)).not.toContain('"context"');
		expect(report.summary?.slices[0]?.context).toBeUndefined();
	});
});
