import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// The conformance kit's truth property runs a hundred seeds over nine layouts — heavy by design, slow under a full-repo run.
		// 180 s since WP91: the desk conformance property over the advice desk took 73 s on CI (60 s tripped).
		testTimeout: 180_000,
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts'],
			reporter: ['text', 'json-summary']
		}
	}
});
