import { ESLint } from 'eslint';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The lint rule (WP57, `44-…` §4.4): no `<svg>` or `<canvas>` under
 * `components/control-room` or `routes/workshop` outside `Meter`, `Tape`
 * and `Boundary`. Proven by planting a violation on disk at a path the rule
 * covers and linting it through the repo's own `eslint.config.js` — on disk,
 * because the TypeScript project service will not type a file that is not
 * there — then the same markup at a path the rule exempts.
 */
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

const PLANTED = `<script lang="ts">\n\tlet x = 1;\n</script>\n\n<svg viewBox="0 0 10 10"><circle r={x} /></svg>\n`;

async function lintPlanted(relative: string) {
	const path = resolve(REPO, relative);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, PLANTED);
	try {
		const eslint = new ESLint({ cwd: REPO });
		const [result] = await eslint.lintFiles([path]);
		return result?.messages ?? [];
	} finally {
		rmSync(path, { force: true });
	}
}

const chartRule = (messages: { ruleId: string | null; message: string }[]) =>
	messages.find((m) => m.ruleId === 'no-restricted-syntax');

describe('the chart lint rule', () => {
	it('refuses an <svg> in a Control Room component that is not one of the three', async () => {
		const hit = chartRule(
			await lintPlanted('apps/workbench/src/lib/components/control-room/Planted.svelte')
		);
		expect(hit?.message).toContain('Meter');
	}, 60_000);

	it('refuses one on a Workshop route too', async () => {
		const hit = chartRule(
			await lintPlanted('apps/workbench/src/routes/workshop/planted-lint/+page.svelte')
		);
		expect(hit).toBeDefined();
		rmSync(resolve(REPO, 'apps/workbench/src/routes/workshop/planted-lint'), {
			recursive: true,
			force: true
		});
	}, 60_000);

	it('lets Meter, Tape and Boundary draw', async () => {
		const eslint = new ESLint({ cwd: REPO });
		const results = await eslint.lintFiles([
			resolve(REPO, 'apps/workbench/src/lib/components/control-room/Meter.svelte'),
			resolve(REPO, 'apps/workbench/src/lib/components/control-room/Tape.svelte')
		]);
		for (const result of results) expect(chartRule(result.messages)).toBeUndefined();
	}, 60_000);
});
