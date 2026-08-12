import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where the workbench lives on disk, for the handful of tests that read source
 * files rather than importing them.
 *
 * Neither obvious approach works here. `process.cwd()` is the workspace under
 * `npm run test` but the repo root under a root-level `vitest --root`, and Vite
 * rewrites `import.meta.url` to a root-relative module id — so
 * `new URL('../../', import.meta.url).pathname` resolves to `/src/...`, which on
 * Windows becomes `C:\src\...`. That happened to be a real directory on the
 * machine this was written on, so a test that scanned it appeared to pass while
 * reading entirely the wrong tree.
 *
 * Probing for a known file is boring and portable, which is what is wanted.
 */
export function workbenchRoot(): string {
	const marker = join('src', 'lib', 'styles', 'tokens.css');
	const candidates = [process.cwd(), join(process.cwd(), 'apps', 'workbench')];

	for (const candidate of candidates) {
		if (existsSync(join(candidate, marker))) return candidate;
	}
	throw new Error(`cannot locate the workbench from ${process.cwd()}`);
}
