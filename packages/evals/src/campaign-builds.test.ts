import { describe, expect, it } from 'vitest';
import { makeSpec } from '@craftabot/core/testing';
import { buildKitFile } from '@craftabot/core';
import workshopPack from '@craftabot/pack-workshop';
import { injectionBaseline } from './baseline-campaign.js';
import {
	campaignEnvelope,
	noiseRatesSchema,
	parseCampaignReport,
	runCampaign,
	type Campaign
} from './campaign.js';

/**
 * A report names its builds' bots (WP49, `37-…` §4.2): a build made from a
 * kit file carries that kit's agent; a `starter-default` build is nobody's;
 * a report written before the field existed still parses.
 */

function withKitBuild(): Campaign {
	const base = injectionBaseline([1]);
	const spec = makeSpec();
	const kit = buildKitFile(spec, {
		exportedBy: 'test',
		exportedAt: '2026-09-03T09:00:00.000Z',
		requires: { core: '>=0.0.1', packs: {}, brickKinds: {} }
	});
	return {
		...base,
		builds: [base.builds[0]!, { id: 'shelf-bot', base: { kind: 'kit', kit } }],
		// One scenario, one guard, one brain: enough cells to see both builds, few enough to be quick.
		scenarios: base.scenarios.slice(0, 1),
		guards: base.guards.slice(0, 1),
		brains: base.brains.slice(0, 1),
		gates: [base.gates[0]!]
	};
}

describe('campaign report builds', () => {
	it('names the kit build’s bot and leaves the default build nameless; the envelope carries the whole report', async () => {
		const campaign = withKitBuild();
		const report = await runCampaign(campaign, { packs: [workshopPack] });
		const spec = makeSpec();
		expect(report.builds).toEqual([
			{ id: campaign.builds[0]!.id },
			{ id: 'shelf-bot', agentId: spec.id, agentName: spec.name }
		]);
		expect(report.cells.filter((cell) => cell.build === 'shelf-bot')).toHaveLength(1);
		const envelope = campaignEnvelope(report);
		expect(envelope).toMatchObject({
			id: report.id,
			title: report.campaignTitle,
			cells: report.cells.length,
			gatesTotal: 1
		});
		expect(parseCampaignReport(envelope.report).builds).toEqual(report.builds);
	});

	it('parses a report written before builds existed, as an empty list', () => {
		const report = parseCampaignReport({
			schemaVersion: 1,
			id: 'old',
			campaignId: 'c',
			campaignTitle: 'Old',
			createdAt: '2026-09-01T00:00:00.000Z',
			packVersions: {},
			noise: Object.fromEntries(Object.keys(noiseRatesSchema.shape).map((key) => [key, 0])),
			cells: [],
			gates: [],
			passed: true,
			budget: { liveCells: 0, tokensIn: 0, tokensOut: 0 }
		});
		expect(report.builds).toEqual([]);
	});
});
