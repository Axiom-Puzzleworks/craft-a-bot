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
	/*
	 * One retry, in CI only (WP56 stage A, `41-…` §6.13 G36). The suite has a
	 * class of test that opens a Workshop screen straight after a run and
	 * reads what was persisted; those now wait on the Play route's own saved
	 * notice rather than racing the write, and the retry is the budget for
	 * whatever a busy runner does that a wait cannot cover. Locally it stays
	 * at zero, so a flake is seen rather than absorbed.
	 */
	retries: process.env.CI ? 1 : 0,
	use: {
		baseURL: 'http://localhost:4173'
	}
});
