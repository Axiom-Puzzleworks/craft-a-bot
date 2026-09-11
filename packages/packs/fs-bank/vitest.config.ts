import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// 60 s since WP91's close: the tenet-13 property (a hundred seeds × every purpose) tripped 5 s on CI.
		testTimeout: 60_000,
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts'],
			reporter: ['text', 'json-summary']
		}
	}
});
