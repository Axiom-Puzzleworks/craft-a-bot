import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		/**
		 * The harness's tests drive whole sessions, campaigns and forks through
		 * the CLI. Under a full `npm test`, beside every other package's suite,
		 * vitest's 5 s default times out tests that take one alone (2026-10-02:
		 * a dozen at once), so the harness allows 30 s, as several tests already
		 * did one by one.
		 */
		testTimeout: 30_000,
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts', 'src/main.ts'],
			reporter: ['text', 'json-summary'],
			/**
			 * The file store holds everything a headless run produces, and the
			 * credential reader is the harness's half of hard rule 2 — both gated,
			 * as the workbench's own storage and vault are.
			 */
			thresholds: {
				'src/storage/file-storage.ts': {
					statements: 90,
					branches: 80,
					functions: 90,
					lines: 90
				},
				'src/credentials.ts': { statements: 100, branches: 100, functions: 100, lines: 100 }
			}
		}
	}
});
