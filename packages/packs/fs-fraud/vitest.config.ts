import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// The conformance kit's truth property runs a hundred seeds over sixteen layouts — heavy by design, slow under a full-repo run.
		testTimeout: 60_000,
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts'],
			reporter: ['text', 'json-summary']
		}
	}
});
