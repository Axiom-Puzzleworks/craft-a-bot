import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts'],
			reporter: ['text', 'json-summary'],
			/** One definition, read everywhere (tenet 20): a metric nobody tested is a metric nobody should read. */
			thresholds: { statements: 90, branches: 80, functions: 90, lines: 90 }
		}
	}
});
