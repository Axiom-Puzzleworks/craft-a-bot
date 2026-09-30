import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	CONTENT_SCHEMA_VERSION,
	localContentId,
	reviewSlug,
	type ContentRecord,
	type Review,
	type ReviewSubject
} from '@craftabot/core';
import { GUARDRAIL_CATALOGUE, checkCatalogue } from '@craftabot/governance';
import {
	GOVERNANCE_GUARDRAIL_IDS,
	blueprintItems,
	readingProgress
} from '@craftabot/governance/reports';
import { PERSONA_IDS, SCREENING_READINGS, ukRetailBankingDomain } from '@craftabot/pack-fs-bank';
import { checkCalibration, checkControlMap, checkDomainPack } from '@craftabot/pack-testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { main } from './cli.js';
import { readBlueprintNotes, readingsFor } from './commands/readings.js';
import { createRegistry, defaultConfig, defaultPacks } from './config.js';

/**
 * **The reading desk over the bank** (WP129, `108-READINGS.md` §8): the
 * queue's open count equals the pending set counted straight from the sources,
 * kind by kind; the four checks raise exactly that set under `requireReview`;
 * and a review of one subject turns its check green for that subject only.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const BLUEPRINTS = join(HERE, '..', '..', '..', 'docs', 'blueprints');
const NOW = '2026-09-30T12:00:00.000Z';
const manifests = defaultPacks();
const registry = createRegistry(defaultConfig());
const once = <T extends { id: string }>(items: T[]) => [
	...new Map(items.reverse().map((item) => [item.id, item])).values()
];
const tables = once(manifests.flatMap((manifest) => manifest.calibrations ?? []));
const maps = once(manifests.flatMap((manifest) => manifest.controlMaps ?? []));

function review(subject: ReviewSubject, verdict: Review['verdict'] = 'accepted'): Review {
	return {
		id: localContentId('review', reviewSlug(subject)),
		subject,
		verdict,
		by: { kind: 'person', id: 'andrew', name: 'Andrew' },
		on: NOW,
		...(verdict === 'rejected' ? { note: 'Not what the source says.' } : {}),
		schemaVersion: 1
	};
}
const record = (value: Review): ContentRecord => ({
	id: value.id,
	kind: 'review',
	title: `${value.subject.id}: ${value.verdict}`,
	record: value,
	savedAt: value.on,
	schemaVersion: CONTENT_SCHEMA_VERSION
});

describe('the queue’s count is the pending set (WP129)', () => {
	it('kind by kind, counted straight from the sources, across all eight', async () => {
		const blueprints = await readBlueprintNotes(BLUEPRINTS);
		expect(blueprints.map((note) => note.id)).toEqual(['healthcare', 'logistics', 'manufacturing']);
		const file = await readingsFor({ packs: manifests, blueprints, generatedAt: NOW });
		const open = Object.fromEntries(file.progress.map((row) => [row.kind, row.open]));
		const errorModels = once(manifests.flatMap((manifest) => manifest.errorModels ?? []));
		const reviewerModels = once(manifests.flatMap((manifest) => manifest.reviewerModels ?? []));
		const direct = {
			'catalogue-entry': GUARDRAIL_CATALOGUE.entries.filter((entry) => entry.review === 'pending')
				.length,
			'calibration-row': tables
				.flatMap((table) => table.rows)
				.filter((row) => row.review === 'pending').length,
			'control-row': maps.flatMap((map) => map.rows).filter((row) => row.status !== undefined)
				.length,
			'decision-right': ukRetailBankingDomain.decisionRights.length,
			'blueprint-item': blueprints.flatMap((note) =>
				blueprintItems(note.markdown).filter((item) => !item.checked)
			).length,
			'screening-list': SCREENING_READINGS.length,
			'error-model': errorModels.length,
			'reviewer-model': reviewerModels.length
		};
		expect(open).toEqual(direct);
		// Every kind has something to read: the seven readings Day 5 and Day 6 named are the queue's first contents.
		for (const [kind, count] of Object.entries(direct)) expect(count, kind).toBeGreaterThan(0);
		expect(direct['blueprint-item']).toBe(36);
		expect(direct['screening-list']).toBe(2);
	});

	it('and the four checks raise that set under requireReview, no more and no less', () => {
		const file = { requireReview: true } as const;
		const calibration = tables.flatMap((table) => checkCalibration(table, file));
		const catalogue = checkCatalogue(GUARDRAIL_CATALOGUE, registry, file);
		const control = maps.flatMap((map) =>
			checkControlMap(map, registry, {
				...file,
				resolve: false,
				knownGuardrails: GOVERNANCE_GUARDRAIL_IDS
			})
		);
		const rights = checkDomainPack(ukRetailBankingDomain, registry, {
			manifests,
			personas: PERSONA_IDS,
			knownGuardrails: GOVERNANCE_GUARDRAIL_IDS,
			requireReview: true
		});
		const pending = (issues: Array<{ check: string }>, check: string) =>
			issues.filter((issue) => issue.check === check).length;
		expect(pending(calibration, 'calibration.review-pending')).toBe(
			tables.flatMap((table) => table.rows).filter((row) => row.review === 'pending').length
		);
		expect(pending(catalogue, 'catalogue.review-pending')).toBe(
			GUARDRAIL_CATALOGUE.entries.filter((entry) => entry.review === 'pending').length
		);
		expect(pending(control, 'control-map.review-pending')).toBe(
			maps.flatMap((map) => map.rows).filter((row) => row.status !== undefined).length
		);
		expect(pending(rights, 'domain.decision-right-pending')).toBe(
			ukRetailBankingDomain.decisionRights.length
		);
		// Without requireReview the checks are as they were: the bank is green.
		expect(
			checkDomainPack(ukRetailBankingDomain, registry, {
				manifests,
				personas: PERSONA_IDS,
				knownGuardrails: GOVERNANCE_GUARDRAIL_IDS
			})
		).toEqual([]);
	});
});

describe('a review turns its check green for that subject only (WP129)', () => {
	it('a calibration row', () => {
		const table = tables.find((entry) => entry.rows.some((row) => row.review === 'pending'))!;
		const row = table.rows.find((entry) => entry.review === 'pending')!;
		const before = checkCalibration(table, { requireReview: true });
		const reviews = [review({ kind: 'calibration-row', id: `${table.id}#${row.id}` })];
		const after = checkCalibration(table, { requireReview: true, reviews });
		expect(after).toHaveLength(before.length - 1);
		const gone = before
			.map((issue) => issue.message)
			.filter((message) => !after.some((issue) => issue.message === message));
		expect(gone).toEqual([expect.stringContaining(`row "${row.id}"`)]);
		expect(after.some((issue) => issue.message.includes(`row "${row.id}"`))).toBe(false);
		expect(before.some((issue) => issue.message.includes(`row "${row.id}"`))).toBe(true);
		// A rejection keeps it red.
		expect(
			checkCalibration(table, {
				requireReview: true,
				reviews: [review({ kind: 'calibration-row', id: `${table.id}#${row.id}` }, 'rejected')]
			})
		).toHaveLength(before.length);
	});

	it('a catalogue entry', () => {
		const entry = GUARDRAIL_CATALOGUE.entries.find((candidate) => candidate.review === 'pending')!;
		const before = checkCatalogue(GUARDRAIL_CATALOGUE, registry, { requireReview: true });
		const after = checkCatalogue(GUARDRAIL_CATALOGUE, registry, {
			requireReview: true,
			reviews: [review({ kind: 'catalogue-entry', id: entry.id })]
		});
		expect(after).toHaveLength(before.length - 1);
		expect(after.some((issue) => issue.entryId === entry.id)).toBe(false);
	});

	it('a control row', () => {
		const map = maps.find((candidate) => candidate.rows.some((row) => row.status !== undefined))!;
		const row = map.rows.find((candidate) => candidate.status !== undefined)!;
		const options = {
			requireReview: true,
			resolve: false,
			knownGuardrails: GOVERNANCE_GUARDRAIL_IDS
		};
		const before = checkControlMap(map, registry, options).filter(
			(issue) => issue.check === 'control-map.review-pending'
		);
		const after = checkControlMap(map, registry, {
			...options,
			reviews: [review({ kind: 'control-row', id: `${map.id}#${row.ref}` })]
		}).filter((issue) => issue.check === 'control-map.review-pending');
		expect(after).toHaveLength(before.length - 1);
		expect(after.some((issue) => issue.message.includes(`row "${row.ref}"`))).toBe(false);
	});

	it('a decision right', () => {
		const right = ukRetailBankingDomain.decisionRights[0]!;
		const options = {
			manifests,
			personas: PERSONA_IDS,
			knownGuardrails: GOVERNANCE_GUARDRAIL_IDS,
			requireReview: true
		};
		const rights = (issues: ReturnType<typeof checkDomainPack>) =>
			issues.filter((issue) => issue.check === 'domain.decision-right-pending');
		const before = rights(checkDomainPack(ukRetailBankingDomain, registry, options));
		const after = rights(
			checkDomainPack(ukRetailBankingDomain, registry, {
				...options,
				reviews: [
					review({ kind: 'decision-right', id: `${ukRetailBankingDomain.id}#${right.kind}` })
				]
			})
		);
		expect(after).toHaveLength(before.length - 1);
		expect(after.some((issue) => issue.message.includes(`"${right.kind}"`))).toBe(false);
	});
});

describe('craftabot readings export (WP129)', () => {
	let dir: string;
	beforeAll(async () => {
		dir = await mkdtemp(join(tmpdir(), 'cab-readings-'));
	});
	afterAll(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it('reads the readings from the content directory, and writes the maintainer’s work list', async () => {
		const screening = review({ kind: 'screening-list', id: 'fs-bank/screening#sanctions' });
		const amended: Review = {
			...review({
				kind: 'decision-right',
				id: `${ukRetailBankingDomain.id}#adverse-credit-decision`
			}),
			verdict: 'amended',
			amendment: { field: 'ceiling', value: 2 }
		};
		const contentDir = join(dir, 'content');
		const { mkdir, writeFile } = await import('node:fs/promises');
		await mkdir(join(contentDir, 'reviews'), { recursive: true });
		for (const value of [screening, amended])
			await writeFile(
				join(contentDir, 'reviews', `${value.id.split('/').pop()}.json`),
				JSON.stringify(record(value))
			);
		const out = join(dir, 'readings.md');
		const lines: string[] = [];
		const code = await main(
			[
				'readings',
				'export',
				'--format',
				'markdown',
				'--out',
				out,
				'--content',
				contentDir,
				'--blueprints',
				BLUEPRINTS
			],
			{ stdout: (text) => void lines.push(text), stderr: () => {}, env: {} }
		);
		expect(code).toBe(0);
		expect(lines.join('')).toMatch(/readings: 2 of \d+ read/);
		const markdown = await readFile(out, 'utf8');
		expect(markdown).toContain(
			'- `decision-right` `fs-bank/uk-retail-banking#adverse-credit-decision`: set `ceiling` to `2` — Andrew, 2026-09-30'
		);
		expect(markdown).toContain('| Screening lists | 1 | 2 | 0 | 0 | 1 |');
		const json = await main(
			['readings', 'export', '--content', contentDir, '--blueprints', BLUEPRINTS],
			{
				stdout: (text) => void lines.push(text),
				stderr: () => {},
				env: {}
			}
		);
		expect(json).toBe(0);
		const file = JSON.parse(lines.at(-1)!) as {
			kind: string;
			progress: ReturnType<typeof readingProgress>;
		};
		expect(file.kind).toBe('craftabot-readings');
		expect(file.progress.find((row) => row.kind === 'decision-right')).toMatchObject({
			read: 1,
			amended: 1
		});
	});
});
