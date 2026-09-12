import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { domainSpecSchema } from '@craftabot/core';
import { checkDomainPack } from '@craftabot/pack-testkit';
import { describe, expect, it } from 'vitest';
import { createRegistry, defaultConfig, defaultPacks } from './config.js';

/**
 * **The blueprint and the three notes** (WP108, `83-…` §6.6.3;
 * `docs/blueprints/`): the blueprint's every checklist row names a `check`
 * and a bank file; each note carries a checkbox per checklist item; and each
 * note's `DomainSpec` fixture validates the schema and fails
 * `checkDomainPack` for the one reason a note can — its packs are not
 * installed — which is the test that the check checks.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const BLUEPRINTS = join(HERE, '..', '..', '..', 'docs', 'blueprints');
const NOTES = ['HEALTHCARE.md', 'LOGISTICS.md', 'MANUFACTURING.md'];
const CHECKLIST_ITEMS = 11;

const registry = createRegistry(defaultConfig());
const manifests = defaultPacks();

describe('docs/blueprints', () => {
	it('the blueprint’s every checklist row names a check and a bank file', () => {
		const text = readFileSync(join(BLUEPRINTS, 'DOMAIN-PACK.md'), 'utf8');
		const rows = text
			.split('\n')
			.filter((line) => /^\| \d+ +\| /.test(line))
			.map((line) => line.split('|').map((cell) => cell.trim()));
		expect(rows).toHaveLength(CHECKLIST_ITEMS);
		for (const row of rows) {
			const [, , , check, file] = row;
			expect(check, row[1]).toMatch(/`domain\.[a-z-]+`/);
			expect(file, row[1]).toMatch(/`packages\/(packs\/fs-[a-z]+|harness)\//);
		}
	});

	it('each note carries a checkbox per checklist item, and ends not scheduled', () => {
		for (const name of NOTES) {
			const text = readFileSync(join(BLUEPRINTS, name), 'utf8');
			const boxes = text.split('\n').filter((line) => /^- \[ \] /.test(line));
			expect(boxes.length, name).toBeGreaterThanOrEqual(CHECKLIST_ITEMS);
			expect(text, name).toMatch(/Not scheduled\./);
			expect(text, name).toMatch(/## 7\. What would be typed, by count/);
			expect(text, name).toMatch(/## 8\. Sizing/);
		}
	});

	it('each fixture validates the schema and fails the check for want of its packs — nothing else about it is wrong', () => {
		const fixtures = readdirSync(join(BLUEPRINTS, 'fixtures'))
			.filter((name) => name.endsWith('.domain.json'))
			.sort();
		expect(fixtures).toEqual([
			'healthcare.domain.json',
			'logistics.domain.json',
			'manufacturing.domain.json'
		]);
		for (const name of fixtures) {
			const raw: unknown = JSON.parse(readFileSync(join(BLUEPRINTS, 'fixtures', name), 'utf8'));
			const parsed = domainSpecSchema.safeParse(raw);
			expect(parsed.success, name).toBe(true);
			const spec = parsed.data!;
			const issues = checkDomainPack(spec, registry, { manifests });
			const packs = [spec.packs.world, ...spec.packs.journeys];
			const missing = issues.filter((issue) => issue.check === 'domain.packs-registered');
			expect(
				missing.map((issue) => issue.message),
				name
			).toEqual(packs.map((pack) => `domain "${spec.id}": pack "${pack}" is not installed`));
			// With no pack installed the shipped journeys have no workflow and the table is on no manifest; nothing else.
			const others = new Set(
				issues.filter((issue) => issue.check !== 'domain.packs-registered').map((i) => i.check)
			);
			expect([...others].sort(), name).toEqual(['domain.calibration', 'domain.journey-ships']);
			expect(
				spec.journeys.filter((journey) => journey.status === 'out'),
				name
			).toHaveLength(2);
			expect(
				spec.journeys.every((j) => j.status === 'shipped' || j.why),
				name
			).toBe(true);
			for (const journey of spec.journeys)
				if (journey.status === 'shipped')
					expect(spec.packs.journeys, name).toContain(journey.workflowId.split('/')[0]);
		}
	});
});
