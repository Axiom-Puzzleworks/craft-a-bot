import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
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
