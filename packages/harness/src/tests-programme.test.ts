import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **The test programme** (plan 114 WP213, `112-REAL-ENOUGH-PLAN.md` §9; G198): the fourteen questions as files under `tests/`. Each names
 * its designs, which must exist; a test that says it has been run names committed results, which must exist; and a test that says it
 * has not been run names none. A status the evidence does not carry is refused.
 */
const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const TESTS = join(ROOT, 'tests');
const EVIDENCE = join(ROOT, 'docs', 'evidence');

interface TestFile {
	id: string;
	title: string;
	designs: string[];
	status: 'not-run' | 'partly-run' | 'run';
	evidence: string[];
	note: string;
}

const files = readdirSync(TESTS)
	.filter((name) => /^T\d\d\.json$/.test(name))
	.sort();
const tests = files.map((name) => JSON.parse(readFileSync(join(TESTS, name), 'utf8')) as TestFile);

/** A committed result by experiment id, in the evidence folder or one of the suites' under it. */
function resultExists(id: string): boolean {
	const dirs = [
		EVIDENCE,
		...readdirSync(EVIDENCE, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => join(EVIDENCE, entry.name))
	];
	return dirs.some((dir) => existsSync(join(dir, id, `${id}.experiment-result.json`)));
}

describe('the test programme (WP213)', () => {
	it('has the fourteen questions, T01 to T14', () => {
		expect(tests.map((test) => test.id)).toEqual(
			Array.from({ length: 14 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`)
		);
	});

	for (const test of tests) {
		it(`${test.id}: its designs exist, and its status is what its evidence carries`, () => {
			for (const design of test.designs)
				expect(existsSync(join(ROOT, design)), `${test.id}: ${design}`).toBe(true);
			for (const id of test.evidence)
				expect(resultExists(id), `${test.id}: no committed result ${id}`).toBe(true);
			if (test.status === 'not-run') expect(test.evidence).toEqual([]);
			else expect(test.evidence.length, `${test.id} says ${test.status}`).toBeGreaterThan(0);
			expect(test.note.length).toBeGreaterThan(20);
		});
	}
});
