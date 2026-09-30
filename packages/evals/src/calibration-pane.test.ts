import type {
	PackManifest,
	Reader,
	ReaderExecutor,
	StageSpec,
	WorkItem,
	WorkflowSpec
} from '@craftabot/core';
import { TEST_DESK_ID, testDesk } from '@craftabot/desk/testing';
import { brierScore, expectedCalibrationError, gateCurve } from '@craftabot/metrics';
import { describe, expect, it } from 'vitest';
import { parseCampaign, parseCampaignReport, runCampaign } from './campaign.js';
import { calibrationOf } from './campaign-summary.js';
import { renderCampaignScorecard } from './campaign-scorecard.js';

/**
 * **The calibration pane** (WP118, `104-READERS.md` §9): a book through a
 * journey whose one stage is a `reader`, under two configurations — the
 * reader acting on every answer, and the same reader gated at 0.6. The cells
 * carry each reading with the stage's answer key from truth; the summary folds
 * one row per build, stage, question and reader, whose ECE, Brier and gate
 * curve are `@craftabot/metrics`' over the same answers; a report parses back
 * to itself; a campaign with no reader has no pane.
 */
interface Payload {
	/** P(red) the reader answers with. */
	p: number;
}

const reader: Reader = {
	id: 'badges/reader/badge',
	name: 'Badge',
	description: 'Reads p off the subject.',
	kind: 'hosted',
	egress: [],
	browserCapable: true,
	answers: ['choice'],
	ask: async (subject) => {
		const { p } = subject as Payload;
		return {
			model: 'badge-1',
			method: 'hosted',
			answers: {
				colour: {
					type: 'choice',
					choice: p >= 0.5 ? 'red' : 'green',
					probabilities: { red: p, green: 1 - p },
					confidence: Math.abs(2 * p - 1)
				}
			}
		};
	}
};

const readBadge = (gate?: ReaderExecutor['gate']): ReaderExecutor => ({
	kind: 'reader',
	readerId: reader.id,
	subject: (input) => input,
	questions: () => ({
		colour: {
			type: 'choice',
			instructions: 'Which colour is the badge?',
			criteria: { red: 'Red', green: 'Green' }
		}
	}),
	output: (answers) => ({
		colour: answers['colour']?.type === 'choice' ? answers['colour'].choice : 'grey'
	}),
	...(gate ? { gate } : {})
});

const badge: StageSpec = {
	id: 'badge',
	name: 'Read the badge',
	input: { type: 'object' },
	output: { type: 'object', required: ['colour'] },
	executor: { kind: 'rule', rule: 'grey-v1' },
	answerKey: (truth) => {
		const colour = (truth as { facts?: { colour?: string } }).facts?.colour;
		return colour ? { colour } : undefined;
	},
	next: () => 'end'
};

const WORKFLOW: WorkflowSpec = {
	id: 'badges/badges',
	name: 'Badges',
	worldId: TEST_DESK_ID,
	purpose: 'Read a badge',
	intake: (item) => ({ layoutId: 'one-visitor', input: item.payload }),
	stages: [badge],
	first: 'badge',
	obligations: [],
	rules: { 'grey-v1': () => ({ output: { colour: 'grey' } }) },
	configurations: {
		read: { executors: { badge: readBadge() } },
		gated: {
			executors: {
				badge: readBadge({ threshold: 0.6, else: { kind: 'rule', rule: 'grey-v1' } })
			}
		},
		rules: {}
	}
};

const PACK: PackManifest = {
	id: 'badges',
	name: 'Badges',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	worlds: [testDesk],
	readers: [reader],
	workflows: [WORKFLOW]
};

/** Forty items: p stepping across [0.05, 1]; the label red where p ≥ 0.5, except every fifth, which is the other. */
const ITEMS: WorkItem[] = Array.from({ length: 40 }, (_, i) => {
	const p = Math.round((0.05 + (i * 0.95) / 39) * 1e4) / 1e4;
	const reads = p >= 0.5 ? 'red' : 'green';
	const colour = i % 5 === 0 ? (reads === 'red' ? 'green' : 'red') : reads;
	return {
		id: `badge-${i}`,
		kind: 'application',
		customerId: `customer-${i}`,
		arrivedAt: '2026-01-05T09:00:00.000Z',
		payload: { p },
		truth: { records: [], facts: { colour } }
	};
});

const campaign = (configurations: string[]) =>
	parseCampaign({
		schemaVersion: 1,
		id: 'badges',
		title: 'Badges',
		scenarios: [],
		source: {
			kind: 'book',
			workflowId: WORKFLOW.id,
			book: {
				schemaVersion: 1,
				kind: 'application',
				items: ITEMS,
				source: { populationDigest: 'test', seed: 1, size: ITEMS.length }
			}
		},
		builds: configurations.map((configuration) => ({
			id: configuration,
			base: { kind: 'starter-default' },
			overrides: { configuration }
		})),
		guards: [{ id: 'none', fit: [] }],
		brains: [{ id: 'scripted-optimal', tier: 'scripted-optimal' }],
		seeds: [1],
		gates: [{ id: 'runs', require: { kind: 'outcome-rate', outcome: 'SUCCESS', atLeast: 1 } }]
	});

const FIXED = { now: () => '2026-09-30T09:00:00.000Z', newId: () => 'report-1' };

describe('the calibration pane (WP118)', () => {
	it('folds one row per reader stage, each figure the metrics’ own over the readings', async () => {
		const report = await runCampaign(campaign(['read', 'gated', 'rules']), {
			packs: [PACK],
			...FIXED
		});
		expect(report.cells.every((cell) => cell.error === undefined)).toBe(true);
		const rows = report.summary?.calibration ?? [];
		expect(rows.map((row) => [row.build, row.stageId, row.questionId, row.readerId])).toEqual([
			['gated', 'badge', 'colour', 'badges/reader/badge'],
			['read', 'badge', 'colour', 'badges/reader/badge']
		]);
		const answers = report.cells
			.filter((cell) => cell.build === 'read')
			.flatMap((cell) => cell.workflow?.readings ?? [])
			.map((reading) => ({
				choice: reading.choice,
				label: reading.label!,
				probabilities: reading.probabilities,
				confidence: reading.confidence
			}));
		expect(answers).toHaveLength(40);
		const read = rows.find((row) => row.build === 'read')!;
		expect(read).toMatchObject({ n: 40, unlabelled: 0, model: 'badge-1' });
		expect(read.accuracy.k).toBe(32);
		expect(read.ece.value).toBeCloseTo(expectedCalibrationError(answers).value, 6);
		expect(read.brier.value).toBeCloseTo(brierScore(answers).value, 6);
		expect(read.gates.map((gate) => gate.reviewed.k)).toEqual(
			gateCurve(answers).map((point) => point.reviewed.k)
		);
		expect(read.reliability).toHaveLength(10);
		// The gated build read the same answers; the gate is on the record, not in the pane's figures.
		const gated = rows.find((row) => row.build === 'gated')!;
		expect(gated.ece).toEqual(read.ece);
		expect(
			report.cells
				.filter((cell) => cell.build === 'gated')
				.flatMap((cell) => cell.workflow?.readings ?? [])
				.filter((reading) => reading.gated)
		).toHaveLength(gated.gates.find((gate) => gate.threshold === 0.6)!.reviewed.k);
		expect(parseCampaignReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
		const markdown = renderCampaignScorecard(report);
		expect(markdown).toContain('## Calibration');
		expect(markdown).toContain('**Gate curve — `gated` · badge · colour**');
		expect(
			renderCampaignScorecard({ ...report, summary: { ...report.summary!, calibration: [] } })
		).not.toContain('## Calibration');
	});

	it('has no pane without a reader, and counts readings with no key apart', async () => {
		const report = await runCampaign(campaign(['rules']), { packs: [PACK], ...FIXED });
		expect(report.summary?.calibration).toEqual([]);
		expect(report.cells.every((cell) => cell.workflow?.readings === undefined)).toBe(true);
		const read = await runCampaign(campaign(['read']), { packs: [PACK], ...FIXED });
		const unkeyed = read.cells.map((cell) => ({
			...cell,
			workflow: {
				...cell.workflow!,
				readings: cell.workflow!.readings!.map((reading) => {
					const rest = { ...reading };
					delete rest.label;
					return rest;
				})
			}
		}));
		expect(calibrationOf(unkeyed)[0]).toMatchObject({ n: 0, unlabelled: 40, ece: { value: 0 } });
	});
});
