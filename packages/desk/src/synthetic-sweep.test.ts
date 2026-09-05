import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkSynthetic, type SyntheticSweepFile } from '@craftabot/pack-testkit';

/**
 * **The synthetic sweep** (WP54 stage C, `45-TRUTH-SYNTHETIC.md` §4.6; hard
 * rule 9): every fixture, cassette, scenario, baseline and corpus file under
 * `packages/` and every campaign under `campaigns/` is swept for the shapes
 * real identifiers have, the way the key-leak tests sweep for a planted
 * credential. It runs in the same CI job, and lives here — beside the
 * primitives, in a package with Node's types — rather than in the kit. If it ever fails, something real
 * was typed into a fixture — do not relax the shape; regenerate the fixture
 * from a seed through the primitives in `@craftabot/desk`.
 *
 * The second test plants a Luhn-valid card number and proves the sweep still
 * bites, so a refactor that blunts it fails the build too.
 */
const REPO = resolve(import.meta.dirname, '../../..');
const ROOTS = ['packages', 'campaigns'];
const SKIP_DIRS = new Set([
	'node_modules',
	'dist',
	'coverage',
	'__snapshots__',
	'.svelte-kit',
	'build'
]);
const FIXTURE_DIRS = new Set(['fixtures', 'baselines', 'cassettes', 'scenarios', 'corpus']);
const EXTENSIONS = new Set(['.json', '.jsonl', '.md', '.ts']);

function walk(dir: string, underFixtures: boolean, out: string[]): void {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		const stat = statSync(path);
		if (stat.isDirectory()) {
			if (SKIP_DIRS.has(name)) continue;
			walk(path, underFixtures || FIXTURE_DIRS.has(name), out);
			continue;
		}
		const extension = name.slice(name.lastIndexOf('.'));
		if (!EXTENSIONS.has(extension)) continue;
		const isCampaign = relative(REPO, dir).replaceAll('\\', '/') === 'campaigns';
		if (underFixtures || isCampaign) out.push(path);
	}
}

export function fixtureFiles(): SyntheticSweepFile[] {
	const paths: string[] = [];
	for (const root of ROOTS) walk(resolve(REPO, root), false, paths);
	return paths.map((path) => ({
		path: relative(REPO, path).replaceAll('\\', '/'),
		text: readFileSync(path, 'utf8')
	}));
}

describe('the synthetic sweep (hard rule 9)', () => {
	const files = fixtureFiles();

	it('finds the estate it is meant to sweep', () => {
		expect(files.length).toBeGreaterThan(40);
		expect(files.some((file) => file.path === 'campaigns/injection-baseline.json')).toBe(true);
		expect(files.some((file) => file.path.startsWith('packages/core/src/fixtures/'))).toBe(true);
	});

	it('every fixture, cassette, scenario, baseline, corpus and campaign file in the repo is synthetic', () => {
		const issues = checkSynthetic(files);
		expect(issues.map((issue) => `${issue.check} ${issue.message}`)).toEqual([]);
	});

	it('still bites: a planted Luhn-valid card number in a fixture fails', () => {
		// Built at run time from its own check digit, so no card-shaped literal sits in the repo.
		const body = '4' + '539' + '1234' + '5678' + '901';
		let sum = 0;
		let double = true;
		for (let index = body.length - 1; index >= 0; index -= 1) {
			let value = Number(body[index]);
			if (double) {
				value *= 2;
				if (value > 9) value -= 9;
			}
			sum += value;
			double = !double;
		}
		const planted = body + String((10 - (sum % 10)) % 10);
		const issues = checkSynthetic([
			{ path: 'packages/x/src/fixtures/planted.json', text: `{ "card": "${planted}" }` }
		]);
		expect(issues.map((issue) => issue.check)).toEqual(['synthetic.pan']);
		// Masked: the sweep never prints what it found.
		expect(issues[0]?.message).not.toContain(planted);
		expect(issues[0]?.message).toContain('planted.json:1');
	});
});
