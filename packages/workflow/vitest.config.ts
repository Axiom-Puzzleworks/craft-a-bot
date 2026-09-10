import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts'],
			reporter: ['text', 'json-summary'],
			/** The stage is the unit of evidence (tenet 21): a path the runtime takes untested is evidence nobody checked. */
			thresholds: { statements: 85, branches: 75, functions: 85, lines: 85 }
		}
	}
});
