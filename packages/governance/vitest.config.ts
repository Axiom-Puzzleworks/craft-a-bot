import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts', 'src/test-context.ts'],
			reporter: ['text', 'json-summary'],
			/**
			 * These are the whole point of the package, and `08` §7.2 asks that all
			 * three rules demonstrably work. A threshold keeps that true as the
			 * package grows, rather than being measured once and quietly decaying —
			 * the same pattern as the world predicates in `pack-starter`.
			 */
			thresholds: {
				'src/guardrails/*.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
				'src/spec-guardrails.ts': { statements: 100, branches: 100, functions: 100, lines: 100 }
			}
		}
	}
});
