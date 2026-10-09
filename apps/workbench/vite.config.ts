/// <reference types="vitest/config" />
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { extname } from 'node:path';
import { liveSiteAssets } from '../../scripts/live-site-assets.mjs';

/**
 * The edition (WP69, `59-EDITIONS.md` §4.2): `CAB_EDITION` names one of the
 * three sections of the site; unset — `npm run build`, `npm run dev`, every
 * test — the build is `full`, today's app, into `build/` under no base. A
 * named edition builds into `build/<edition>/` under `/<edition>`. The same
 * variable reaches the bundle through `envPrefix`, so `edition.ts` reads it.
 */
const EDITION_IDS = ['simulator', 'workshop', 'playground'];
const CAB_EDITION = process.env['CAB_EDITION'];
if (CAB_EDITION !== undefined && CAB_EDITION !== 'full' && !EDITION_IDS.includes(CAB_EDITION)) {
	throw new Error(
		`CAB_EDITION must be one of ${EDITION_IDS.join(', ')} or full, got "${CAB_EDITION}"`
	);
}
const edition = CAB_EDITION !== undefined && CAB_EDITION !== 'full' ? CAB_EDITION : undefined;

/**
 * The live tier, served from the site (WP196's remainder, `114-…`; `scripts/live-site-assets.mjs`): the committed live results, their
 * designs and the cassettes the Worker replays them from, emitted beside the app in every edition that has the Workshop (the
 * Simulator has no Experiments page), and served the same way by the dev server. `CAB_LIVE_ASSETS=0` leaves them out of a build.
 */
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const serveLiveTier = edition !== 'simulator' && process.env['CAB_LIVE_ASSETS'] !== '0';
const liveAssets = {
	name: 'craftabot-live-assets',
	generateBundle(this: {
		emitFile: (file: { type: 'asset'; fileName: string; source: string | Uint8Array }) => void;
	}) {
		if (!serveLiveTier) return;
		for (const file of liveSiteAssets(repoRoot))
			this.emitFile({ type: 'asset', fileName: file.fileName, source: file.source });
	},
	configureServer(server: {
		middlewares: {
			use: (
				handler: (
					req: { url?: string },
					res: {
						setHeader: (k: string, v: string) => void;
						end: (body: string | Uint8Array) => void;
						statusCode: number;
					},
					next: () => void
				) => void
			) => void;
		};
	}) {
		if (!serveLiveTier) return;
		let files: Map<string, string | Uint8Array> | undefined;
		server.middlewares.use((req, res, next) => {
			const path = (req.url ?? '')
				.split('?')[0]!
				.replace(/^\/(simulator|workshop|playground)(?=\/)/, '');
			if (!/^\/(cassettes|live)\//.test(path)) return next();
			files ??= new Map(liveSiteAssets(repoRoot).map((file) => [file.fileName, file.source]));
			const body = files.get(decodeURIComponent(path.slice(1)));
			if (body === undefined) return next();
			res.setHeader(
				'content-type',
				extname(path) === '.json' ? 'application/json' : 'application/octet-stream'
			);
			res.end(body);
		});
	}
};

export default defineConfig({
	envPrefix: ['VITE_', 'CAB_'],
	// Vite's own default envDir is wherever this file lives, not the monorepo
	// root — but the one `.env` this repo documents (`.env.example`,
	// `docs/geap-setup.md` §3) lives at the root, alongside every other
	// build-time/smoke-test variable. Without this, `VITE_GEAP_OAUTH_CLIENT_ID`
	// there is silently never read.
	envDir: fileURLToPath(new URL('../../', import.meta.url)),
	plugins: [
		liveAssets,
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Static, local-first build (05-TECH-STACK.md §1). SPA fallback because
			// dynamic per-agent routes (/bench/[agentId], /play/[agentId]) can't be
			// prerendered — see routes/+layout.ts (`ssr = false`).
			adapter: adapter({
				fallback: 'index.html',
				...(edition ? { pages: `build/${edition}`, assets: `build/${edition}` } : {})
			}),
			...(edition ? { paths: { base: `/${edition}` } } : {}),
			// The edition's packs: one module per box, so a bundle carries only its own (`59-…` §4.1).
			// `$edition-packs` is the static list (the Worker, the tests); `$edition-main` the main
			// thread's, each desk its own chunk loaded on demand (WP112).
			alias: {
				'$edition-packs': `src/lib/editions/${edition ?? 'full'}.ts`,
				'$edition-main': `src/lib/editions/${edition ?? 'full'}.main.ts`
			}
		})
	],
	test: {
		environment: 'jsdom',
		include: ['src/**/*.{test,spec}.{js,ts}'],
		setupFiles: ['./vitest-setup.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.ts'],
			// Test scaffolding, not behaviour — and the four re-export shims left at
			// the old storage paths (WP36 stage A), whose code now lives and is
			// gated in `@craftabot/core`.
			exclude: [
				'src/lib/**/*.test.ts',
				'src/lib/state/storage.ts',
				'src/lib/state/storage-memory.ts',
				'src/lib/state/storage-contract.ts',
				'src/lib/state/storage-fixtures.ts',
				// WP36 stage B shims: the folds live in core and governance now.
				'src/lib/state/run-projection.ts',
				'src/lib/state/group-replay-projection.ts',
				'src/lib/bot-capabilities.ts',
				'src/lib/workshop/incidents.ts',
				'src/lib/workshop/safety-case.ts',
				'src/lib/workshop/telemetry.ts'
			],
			reporter: ['text', 'json-summary'],
			// The storage layer holds everything the user has made, and the key vault
			// carries hard rule 2. Both are gated rather than merely measured. The
			// contract and the in-memory store carry the same gates in core's own
			// vitest config since WP36 stage A moved them.
			thresholds: {
				'src/lib/state/keys.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
				'src/lib/state/storage-idb.ts': { statements: 90, branches: 80, functions: 90, lines: 90 }
			}
		}
	},
	// Component tests need the browser build of Svelte (client `mount`), not the
	// server/SSR build vitest resolves to by default. See Svelte's Vitest guide.
	...(process.env.VITEST ? { resolve: { conditions: ['browser'] } } : {})
});
