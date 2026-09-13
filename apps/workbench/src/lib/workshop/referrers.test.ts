import type {
	ExperimentResult,
	RunRecord,
	StoredCampaignReport,
	StoredWorkflowRun
} from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { referrersOf } from './referrers.js';

/**
 * WP109 (`96-CONTROL-ROOM-V3.md` §2.4): what links to an artefact, a test per
 * artefact kind over a fixture store.
 */
const RUN = '3f2a9c10-0000-4000-8000-000000000001';
const FORK = '3f2a9c10-0000-4000-8000-000000000002';
const runs = [
	{ id: RUN, agentName: 'Deskbot', goalCardId: 'fs-lending/a-loan', outcome: 'SUCCESS' },
	{
		id: FORK,
		agentName: 'Deskbot',
		goalCardId: 'fs-lending/a-loan',
		outcome: 'SUCCESS',
		forkedFrom: { runId: RUN, tick: 4, notebook: 'restored' }
	}
] as unknown as RunRecord[];
const reports = [
	{
		id: 'report-1',
		campaignId: 'fs-lending-baseline',
		title: 'The lending baseline',
		report: {
			cells: [{ runId: RUN, seed: 3, build: 'lending-bot', guard: 'card' }],
			guards: [{ id: 'card', stack: 'fs-bank/the-lending-desk' }]
		}
	}
] as unknown as StoredCampaignReport[];
const workflowRuns = [
	{
		run: {
			id: 'wf-1',
			workflowId: 'fs-lending/lending',
			stages: [{ stageId: 'decision', runId: RUN }],
			runIds: [RUN]
		},
		source: { kind: 'campaign', id: 'report-1', build: 'lending-bot' }
	},
	{
		run: {
			id: 'wf-2',
			workflowId: 'fs-fraud/fraud',
			stages: [],
			runIds: [],
			handoffs: [{ runId: 'wf-1', workflowId: 'fs-lending/lending', itemId: 'loan-1' }]
		}
	},
	{
		run: { id: 'wf-3', workflowId: 'fs-lending/lending', stages: [], runIds: [] },
		forkedFrom: { runId: 'wf-1', stageId: 'decision' }
	}
] as unknown as StoredWorkflowRun[];
const experiments = [
	{
		id: 'exp@1',
		title: 'The card, measured',
		effects: [{ metricId: 'success-rate', runIds: [RUN], reportIds: ['report-1'] }]
	}
] as unknown as ExperimentResult[];
const store = { runs, reports, workflowRuns, experiments };

describe('linked from', () => {
	it('a run: its campaign cell, its workflow stage, its forks and its experiment', () => {
		const links = referrersOf({ kind: 'run', id: RUN }, store);
		expect(links.map((link) => `${link.kind} ${link.id} — ${link.via}`)).toEqual([
			'campaign-report report-1 — cell seed 3, build lending-bot, guard card',
			'workflow-run wf-1 — stage decision',
			`run ${FORK} — forked at tick 4`,
			'experiment-result exp@1 — effect success-rate'
		]);
		expect(links[0]?.href).toBe('/workshop/campaigns?report=report-1');
		expect(links[2]?.href).toBe(`/workshop/runs/${FORK}`);
	});

	it('a campaign report: the experiment that folds it and the workflow runs it sourced', () => {
		const links = referrersOf({ kind: 'campaign-report', id: 'report-1' }, store);
		expect(links.map((link) => `${link.kind} ${link.id} — ${link.via}`)).toEqual([
			'experiment-result exp@1 — effect success-rate',
			'workflow-run wf-1 — sourced by the campaign, build lending-bot'
		]);
	});

	it('a workflow run: the runs handed off from it and forked from it', () => {
		const links = referrersOf({ kind: 'workflow-run', id: 'wf-1' }, store);
		expect(links.map((link) => `${link.id} — ${link.via}`)).toEqual([
			'wf-2 — handed off from fs-lending/lending, item loan-1',
			'wf-3 — forked at stage decision'
		]);
	});

	it('a stack: the reports that ran under it', () => {
		const links = referrersOf({ kind: 'stack', id: 'fs-bank/the-lending-desk' }, store);
		expect(links.map((link) => `${link.id} — ${link.via}`)).toEqual(['report-1 — guard card']);
	});

	it('an experiment result: nothing links to it; an empty store links nothing', () => {
		expect(referrersOf({ kind: 'experiment-result', id: 'exp@1' }, store)).toEqual([]);
		expect(referrersOf({ kind: 'run', id: RUN }, {})).toEqual([]);
	});
});
