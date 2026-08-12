import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			// Test scaffolding and pure type modules carry no behaviour to cover.
			exclude: ['src/**/*.test.ts', 'src/world/test-state.ts'],
			reporter: ['text', 'json-summary'],
			// WP2's definition of done (09-ROADMAP.md): "world unit tests 100% on
			// predicates & action legality". Encoded here so it stays true, rather
			// than being checked by eye once.
			thresholds: {
				'src/world/predicates.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
				'src/world/actions.ts': { statements: 100, branches: 100, functions: 100, lines: 100 }
			}
		}
	}
});
