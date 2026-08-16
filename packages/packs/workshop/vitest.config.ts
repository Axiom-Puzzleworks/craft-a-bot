import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts'],
			reporter: ['text', 'json-summary'],
			// Same floor `pack-starter` holds itself to (`09-…` WP2's definition of
			// done): world unit tests 100% on predicates and action legality.
			thresholds: {
				'src/world/predicates.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
				'src/world/actions.ts': { statements: 100, branches: 100, functions: 100, lines: 100 }
			}
		}
	}
});
