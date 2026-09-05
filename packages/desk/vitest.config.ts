import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts'],
			reporter: ['text', 'json-summary'],
			/**
			 * The runtime is what every desk stands on (`43-…` §4.4): a door that
			 * silently does nothing is a desk that silently lies. Gated, like the
			 * loop in core.
			 */
			thresholds: {
				'src/desk-world.ts': { statements: 90, branches: 85, functions: 90, lines: 90 }
			}
		}
	}
});
