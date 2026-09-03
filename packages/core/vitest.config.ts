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
				'src/event-bus.ts': { statements: 90, branches: 90, functions: 90, lines: 90 },
				// The loop is the riskiest code in the repo, so it carries the
				// tightest gate; `decide.ts` decides what counts as a mumble and is
				// small enough to hold at 100%.
				'src/session/agent-session.ts': {
					statements: 95,
					branches: 80,
					functions: 90,
					lines: 100
				},
				'src/session/decide.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
				// Persistence carries the key-containment guarantee (hard rule 2), so
				// it is held at the same bar as the loop.
				'src/persistence/**': { statements: 100, branches: 95, functions: 100, lines: 100 },
				// The storage seam holds everything a user has made (WP36 stage A —
				// the same gates it carried in the workbench, moved with the code).
				'src/storage/storage.ts': { statements: 100, branches: 90, functions: 100, lines: 100 },
				'src/storage/memory.ts': { statements: 95, branches: 85, functions: 95, lines: 95 }
			}
		}
	}
});
