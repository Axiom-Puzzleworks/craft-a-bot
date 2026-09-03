import { describe, expect, it } from 'vitest';
import { campaignEvidenceFor, type CampaignReportLike } from './campaign-evidence.js';

const report = (over: Partial<CampaignReportLike> = {}): CampaignReportLike => ({
	id: 'r1',
	campaignTitle: 'Injection baseline',
	createdAt: '2026-09-02T12:00:00.000Z',
	passed: false,
	builds: [
		{ id: 'plain', agentId: 'bot-1', agentName: 'Bolt' },
		{ id: 'default' },
		{ id: 'other', agentId: 'bot-2' }
	],
	cells: [
		{ build: 'plain', outcome: 'SUCCESS' },
		{ build: 'plain', outcome: 'STOPPED_BY_GUARDRAIL' },
		{ build: 'plain' },
		{ build: 'other', outcome: 'ERROR' }
	],
	gates: [
		{ id: 'everyone', required: 'SUCCESS ≥ 50%', observed: 0.5, passed: true },
		{
			id: 'mine',
			required: 'SUCCESS ≥ 90%',
			observed: 0.5,
			passed: false,
			where: { build: 'plain' }
		},
		{ id: 'theirs', required: 'ERROR ≤ 0%', observed: 1, passed: false, where: { build: 'other' } }
	],
	...over
});

describe('campaignEvidenceFor', () => {
	it('quotes the build that is this bot, its cells by outcome, and only the gates that applied to it', () => {
		const [evidence, ...rest] = campaignEvidenceFor('bot-1', [report()]);
		expect(rest).toEqual([]);
		expect(evidence).toEqual({
			reportId: 'r1',
			title: 'Injection baseline',
			createdAt: '2026-09-02T12:00:00.000Z',
			passed: false,
			buildId: 'plain',
			cells: 3,
			outcomes: { SUCCESS: 1, STOPPED_BY_GUARDRAIL: 1, 'not-run': 1 },
			gates: [
				{ id: 'everyone', required: 'SUCCESS ≥ 50%', observed: 0.5, passed: true, scoped: false },
				{ id: 'mine', required: 'SUCCESS ≥ 90%', observed: 0.5, passed: false, scoped: true }
			]
		});
	});

	it('is empty for a bot that ran in no build, and for a report that names no builds at all', () => {
		expect(campaignEvidenceFor('bot-3', [report()])).toEqual([]);
		const { builds: _dropped, ...older } = report();
		void _dropped;
		expect(campaignEvidenceFor('bot-1', [older])).toEqual([]);
	});

	it('lists newest report first, and every build of a report the bot ran in twice', () => {
		const later = report({
			id: 'r2',
			createdAt: '2026-09-03T08:00:00.000Z',
			builds: [
				{ id: 'a', agentId: 'bot-1' },
				{ id: 'b', agentId: 'bot-1' }
			],
			cells: [],
			gates: []
		});
		const rows = campaignEvidenceFor('bot-1', [report(), later]);
		expect(rows.map((row) => [row.reportId, row.buildId])).toEqual([
			['r2', 'a'],
			['r2', 'b'],
			['r1', 'plain']
		]);
	});
});
