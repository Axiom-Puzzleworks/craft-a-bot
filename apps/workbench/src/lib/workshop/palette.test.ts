import type {
	ContentRecord,
	RunRecord,
	StoredCampaignReport,
	StoredWorkflowRun
} from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { lensById } from './lens.js';
import { artefactEntries, matchScore, rankPalette, routeEntries } from './palette.js';
import { viewFromUrl } from './views.js';

/**
 * WP109 (`96-CONTROL-ROOM-V3.md` §2.1, §5): the palette lists every rail
 * destination in the lens's words, every stored artefact by id and title,
 * and ranks a query by a subsequence match that prefers a word start.
 */
const engineer = lensById('engineer');
const assurance = lensById('assurance');

const run = (id: string, agentName: string, outcome = 'SUCCESS'): RunRecord =>
	({
		id,
		agentId: 'agent-1',
		agentName,
		goalCardId: 'starter/say-hello',
		startedAt: '2026-09-13T09:00:00.000Z',
		outcome,
		schemaVersion: 1
	}) as unknown as RunRecord;

const report = (id: string, title: string): StoredCampaignReport =>
	({
		id,
		campaignId: 'starter-baseline',
		title,
		createdAt: '2026-09-13T09:00:00.000Z',
		passed: true,
		gatesPassed: 1,
		gatesTotal: 1,
		cells: 1,
		report: {},
		schemaVersion: 1
	}) as StoredCampaignReport;

const workflowRun = (id: string, workflowId: string): StoredWorkflowRun =>
	({
		run: { id, workflowId, outcome: 'completed', stages: [], runIds: [], events: [] },
		item: { id: 'item-7', kind: 'loan' }
	}) as unknown as StoredWorkflowRun;

describe('the command palette', () => {
	it('lists every rail destination with a route, in the lens’s words and groups', () => {
		const routes = routeEntries(engineer);
		expect(routes.map((entry) => entry.href)).toContain('/workshop/runs');
		expect(routes.find((entry) => entry.href === '/workshop/campaigns')?.title).toBe('Campaigns');
		expect(routes.every((entry) => entry.hint === 'Workshop')).toBe(true);
		const board = routeEntries(assurance);
		expect(board.find((entry) => entry.href === '/workshop/campaigns')?.title).toBe('Trials');
		expect(board.find((entry) => entry.href === '/workshop/assurance')?.hint).toBe('Assurance');
		// The Spec Lab has no route of its own: never listed.
		expect(routes.some((entry) => entry.keywords?.includes('spec'))).toBe(false);
	});

	it('lists every stored artefact by id and title, its kind in the lens’s words', () => {
		const entries = artefactEntries(
			{
				runs: [run('3f2a9c10-0000-4000-8000-000000000001', 'Deskbot')],
				reports: [report('report-1', 'The starter baseline')],
				workflowRuns: [workflowRun('wf-1', 'fs-lending/lending')]
			},
			assurance
		);
		expect(entries.map((entry) => entry.href)).toEqual([
			'/workshop/runs/3f2a9c10-0000-4000-8000-000000000001',
			'/workshop/campaigns?report=report-1',
			'/workshop/workflows/wf-1'
		]);
		expect(entries[0]?.hint).toMatch(/^run 3f2a9c10… · SUCCESS$/);
		expect(entries[1]?.hint).toMatch(/^trial report/);
		expect(entries[2]?.title).toBe('fs-lending/lending · loan item-7');
	});

	it('lists a lens’s saved views, and only that lens’s', () => {
		const mine = viewFromUrl(
			'assurance',
			{ pathname: '/workshop/runs', search: '?outcome=FAILURE' },
			'Failures'
		);
		const theirs = viewFromUrl('engineer', { pathname: '/workshop/runs', search: '' }, 'All');
		const content: ContentRecord[] = [mine, theirs];
		const entries = artefactEntries({ content }, assurance);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			kind: 'view',
			title: 'Failures',
			href: '/workshop/runs?outcome=FAILURE'
		});
	});

	it('ranks a word start over a buried match, a prefix over both, and caps the list', () => {
		expect(matchScore('ru', 'Runs')).toBeGreaterThan(matchScore('ru', 'The Studio — a rule')!);
		expect(matchScore('xyz', 'Runs')).toBeUndefined();
		const entries = [
			...routeEntries(engineer),
			...artefactEntries(
				{ runs: [run('3f2a9c10-0000-4000-8000-000000000001', 'Runabout')] },
				engineer
			)
		];
		const ranked = rankPalette(entries, 'ru');
		expect(ranked[0]?.title).toBe('Runs');
		expect(ranked.length).toBeLessThanOrEqual(12);
		// An id's first characters find the artefact.
		expect(rankPalette(entries, '3f2a9c')[0]?.id).toBe('3f2a9c10-0000-4000-8000-000000000001');
		// The empty query lists everything in kind order, capped.
		const all = rankPalette(entries, '', 100);
		expect(all.length).toBe(entries.length);
		expect(all[0]?.kind).toBe('route');
	});
});
