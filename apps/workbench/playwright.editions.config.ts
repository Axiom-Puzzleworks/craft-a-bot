import { defineConfig } from '@playwright/test';

/**
 * **The editions' smoke specs** (`59-EDITIONS.md` §4.5, WP69): one project
 * per section of the site, each against its own folder under its own base
 * — `npm run build:editions` writes `build/<edition>/` and
 * `scripts/serve-site.mjs` serves the whole `build/` tree the way a static
 * host does, one SPA fallback per folder (`docs/publishing.md` §2); `vite
 * preview` has one fallback for the whole tree and would answer
 * `/playground/` with the `full` build's document. Run with
 * `npm run e2e:editions`; the default config ignores `e2e/editions/`.
 */
const editions = ['simulator', 'workshop', 'playground'] as const;

export default defineConfig({
	webServer: {
		// A static host with one SPA fallback per folder (`scripts/serve-site.mjs`) — `vite preview` has one for the whole tree.
		command: 'npm run build:editions && node ../../scripts/serve-site.mjs --port 4173',
		port: 4173,
		reuseExistingServer: false,
		timeout: 600_000
	},
	testDir: 'e2e/editions',
	projects: editions.map((edition) => ({
		name: edition,
		testMatch: new RegExp(`${edition}\\.spec\\.ts$`),
		use: { baseURL: `http://localhost:4173/${edition}/` }
	})),
	retries: process.env.CI ? 1 : 0
});
