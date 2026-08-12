import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts', 'src/types/**'],
			reporter: ['text', 'json-summary'],
			// WP1's definition of done (09-ROADMAP.md): "≥90% coverage on validation
			// & bus". Encoded so it stays true as core grows.
			thresholds: {
				'src/validate-spec.ts': { statements: 90, branches: 90, functions: 90, lines: 90 },
				'src/event-bus.ts': { statements: 90, branches: 90, functions: 90, lines: 90 }
			}
		}
	}
});
