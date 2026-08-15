import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts'],
			reporter: ['text', 'json-summary'],
			/**
			 * The metrics fold is the package's load-bearing part: every number the
			 * scorecard prints, every baseline gate and every cell the Workshop's
			 * Eval Matrix will render comes out of it. A metric that silently reads
			 * zero is worse than no metric, because it looks like a passing result.
			 */
			thresholds: {
				'src/metrics.ts': { statements: 100, branches: 100, functions: 100, lines: 100 }
			}
		}
	}
});
