import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		/*
		 * Never reuse. This was `!process.env.CI`, which meant a local run
		 * attached to whatever was already on 4173 — usually a preview server
		 * built before the change under test. It cost three debugging detours in
		 * WP16 and, worse, once produced a **green** run: slice d's speed-dial
		 * cadence test passed against a build where the dial was still a no-op.
		 *
		 * A rebuild costs a few seconds. A test that passes against the wrong
		 * code costs whatever it lets through.
		 */
		reuseExistingServer: false
	},
	testDir: 'e2e',
	use: {
		baseURL: 'http://localhost:4173'
	}
});
