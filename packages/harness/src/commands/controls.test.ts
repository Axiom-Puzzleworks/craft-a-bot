import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { main } from '../cli.js';
import { defaultPacks } from '../config.js';
import { controlsFor } from './controls.js';

/**
 * `craftabot controls list | export` (WP134, `110-CONTROL-SUITE-PLAN.md`
 * §4.3): the inventory the Workshop's page folds, from the host — one line
 * per kind, or the whole table as JSON or markdown.
 */
const EXPERIMENTS = resolve(import.meta.dirname, '../../../../experiments');
let dir: string;
beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), 'cab-controls-'));
});
afterAll(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe('craftabot controls', () => {
	it('folds every pack’s controls, fitted by the shipped campaigns and the experiment files', async () => {
		const file = await controlsFor({
			packs: defaultPacks(),
			experimentsDir: EXPERIMENTS,
			generatedAt: '2026-10-01T00:00:00.000Z'
		});
		expect(file.format).toBe('craftabot-control-inventory');
		expect(file.summary.rows).toBe(file.rows.length);
		const card = file.rows.find((row) => row.ref === 'policy-card:fs-lending/policy/cohort-blind')!;
		expect(card.fitted.where.some((where) => where.startsWith('campaign '))).toBe(true);
		expect(card.fitted.where.some((where) => where.startsWith('experiment '))).toBe(true);
		// No store: nothing could have fired.
		expect(card.exercised.state).toBe('no-runs');
	});

	it('lists one line per kind, and exports the table as markdown and JSON', async () => {
		const lines: string[] = [];
		const io = { stdout: (text: string) => void lines.push(text), stderr: () => {}, env: {} };
		expect(await main(['controls', 'list', '--experiments', EXPERIMENTS], io)).toBe(0);
		expect(lines.join('')).toMatch(/^controls: \d+ — \d+ uncatalogued/);
		expect(lines.join('')).toMatch(/\n {2}Mechanism +\d+/);

		const out = join(dir, 'controls.md');
		expect(
			await main(
				['controls', 'export', '--format', 'markdown', '--out', out, '--experiments', EXPERIMENTS],
				io
			)
		).toBe(0);
		const markdown = await readFile(out, 'utf8');
		expect(markdown).toContain('# The Control Inventory');
		expect(markdown).toContain('## Knob (');
		expect(markdown).toContain('`guardrail:connector/tool-blocklist`');

		lines.length = 0;
		expect(await main(['controls', 'export', '--experiments', EXPERIMENTS], io)).toBe(0);
		const json = JSON.parse(lines.join('')) as { format: string; rows: unknown[] };
		expect(json.format).toBe('craftabot-control-inventory');
		expect(json.rows.length).toBeGreaterThan(200);

		await expect(main(['controls', 'nonsense'], io)).resolves.not.toBe(0);
	});
});
