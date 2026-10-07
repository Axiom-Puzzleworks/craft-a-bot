import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { expandExperiment, parseExperiment } from '@craftabot/evals';
import { describe, expect, it } from 'vitest';

/**
 * **A design that asks for no trials is exactly as it was** (WP191,
 * `113-RECORDING-AND-RELIABILITY.md` §4.6): every committed design — the
 * reference experiments and the live ones — expands to campaigns that carry no
 * `trials` field, so their cells carry no trial, their reports no `path`, and
 * their results no reliability: the stored results and every digest stand.
 * (`live-check.mjs` holds the ten committed live results to the digit.)
 */
const ROOT = resolve(import.meta.dirname, '../../../..');
const files = (dir: string) =>
	readdirSync(join(ROOT, dir))
		.filter((name) => name.endsWith('.json'))
		.map((name) => join(ROOT, dir, name));

describe('trials are opt-in (WP191)', () => {
	for (const file of [...files('experiments'), ...files('experiments/live')]) {
		const name = file.slice(ROOT.length + 1).replaceAll(sep, '/');
		it(`${name} expands to campaigns that ask for no trials`, () => {
			const experiment = parseExperiment(JSON.parse(readFileSync(file, 'utf8')));
			expect(experiment.design.trials).toBeUndefined();
			const { campaigns } = expandExperiment(experiment);
			expect(campaigns.length).toBeGreaterThan(0);
			for (const campaign of campaigns) expect('trials' in campaign).toBe(false);
		});
	}
});
