import { describe, expect, it } from 'vitest';
import type { BotCapabilities, EvaluationRecord, RunRecord, RunSummary } from '@craftabot/core';
import { safetyCaseFromSummaries } from './safety-case.js';
import type { CampaignReportLike } from './campaign-evidence.js';

/**
 * The safety case's two new sections (WP49, `37-…` §4.2): evaluation
 * verdicts counted per evaluator over this bot's runs only, and the campaign
 * gates that applied to a build that was this bot.
 */

const AGENT = { id: 'a1', name: 'Bolt', goalCardId: 'starter/say-hello' };
const capabilities = {
	filled: new Set(),
	toolIds: [],
	actionIds: [],
	channels: [],
	cartridgeId: 'demo/demo-brain',
	notebook: false,
	guardrailIds: [],
	fingerprint: 'fp'
} as unknown as BotCapabilities;

let seq = 0;
const run = (over: Partial<RunRecord> = {}): RunRecord =>
	({
		id: `run-${++seq}`,
		agentId: AGENT.id,
		agentName: AGENT.name,
		goalCardId: AGENT.goalCardId,
		outcome: 'SUCCESS',
		startedAt: '2026-09-03T10:00:00.000Z',
		...over
	}) as never as RunRecord;

const evaluation = (
	runId: string,
	evaluatorId: string,
	result: Partial<EvaluationRecord['result']>
): EvaluationRecord => ({
	id: `e-${++seq}`,
	runId,
	evaluatorId,
	result: { evaluatorId, explanation: '', evidence: [], ...result },
	evaluatedAt: '2026-09-03T10:05:00.000Z',
	schemaVersion: 1
});

const worksheet = (
	runs: RunRecord[],
	evaluations: EvaluationRecord[] = [],
	campaigns: CampaignReportLike[] = []
) =>
	safetyCaseFromSummaries(
		AGENT,
		capabilities,
		undefined,
		[],
		runs,
		new Map<string, RunSummary>(),
		evaluations,
		campaigns
	);

describe('safety case v2 — evaluation evidence', () => {
	it('counts verdicts per evaluator over this bot’s runs only, busiest first, with a mean over the scored records', () => {
		const mine = [run(), run()];
		const theirs = run({ agentId: 'someone-else' });
		const result = worksheet(mine, [
			evaluation(mine[0]!.id, 'evaluators/judge', { verdict: 'pass', score: 0.9 }),
			evaluation(mine[1]!.id, 'evaluators/judge', { verdict: 'fail', score: 0.3 }),
			evaluation(mine[1]!.id, 'evaluators/judge', { verdict: 'inconclusive' }),
			evaluation(mine[0]!.id, 'starter/assertions:tidy', { verdict: 'pass' }),
			evaluation(mine[0]!.id, 'evaluators/scorer', { score: 0.5 }),
			evaluation(theirs.id, 'evaluators/judge', { verdict: 'fail' })
		]);
		expect(result.evaluations).toEqual([
			{
				evaluatorId: 'evaluators/judge',
				pass: 1,
				fail: 1,
				inconclusive: 1,
				noVerdict: 0,
				meanScore: 0.6
			},
			{
				evaluatorId: 'evaluators/scorer',
				pass: 0,
				fail: 0,
				inconclusive: 0,
				noVerdict: 1,
				meanScore: 0.5
			},
			{
				evaluatorId: 'starter/assertions:tidy',
				pass: 1,
				fail: 0,
				inconclusive: 0,
				noVerdict: 0,
				meanScore: undefined
			}
		]);
	});

	it('is empty when nothing has judged this bot, and the old callers still compile with no evidence at all', () => {
		expect(worksheet([run()]).evaluations).toEqual([]);
		expect(
			safetyCaseFromSummaries(AGENT, capabilities, undefined, [], [], new Map()).campaigns
		).toEqual([]);
	});
});

describe('safety case v2 — campaign results', () => {
	it('quotes the report a build of this bot ran in', () => {
		const result = worksheet(
			[],
			[],
			[
				{
					id: 'r1',
					campaignTitle: 'Injection baseline',
					createdAt: '2026-09-03T09:00:00.000Z',
					passed: true,
					builds: [{ id: 'shelf-bolt', agentId: AGENT.id, agentName: AGENT.name }],
					cells: [{ build: 'shelf-bolt', outcome: 'SUCCESS' }],
					gates: [{ id: 'g', required: 'SUCCESS ≥ 50%', observed: 1, passed: true }]
				}
			]
		);
		expect(result.campaigns).toHaveLength(1);
		expect(result.campaigns[0]).toMatchObject({
			reportId: 'r1',
			buildId: 'shelf-bolt',
			cells: 1,
			gates: [{ id: 'g', passed: true, scoped: false }]
		});
	});
});
