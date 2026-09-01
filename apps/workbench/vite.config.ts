/// <reference types="vitest/config" />
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	// Vite's own default envDir is wherever this file lives, not the monorepo
	// root — but the one `.env` this repo documents (`.env.example`,
	// `docs/geap-setup.md` §3) lives at the root, alongside every other
	// build-time/smoke-test variable. Without this, `VITE_GEAP_OAUTH_CLIENT_ID`
	// there is silently never read.
	envDir: fileURLToPath(new URL('../../', import.meta.url)),
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Static, local-first build (05-TECH-STACK.md §1). SPA fallback because
			// dynamic per-agent routes (/bench/[agentId], /play/[agentId]) can't be
			// prerendered — see routes/+layout.ts (`ssr = false`).
			adapter: adapter({ fallback: 'index.html' })
		})
	],
	test: {
		environment: 'jsdom',
		include: ['src/**/*.{test,spec}.{js,ts}'],
		setupFiles: ['./vitest-setup.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.ts'],
			// Test scaffolding, not behaviour.
			exclude: [
				'src/lib/**/*.test.ts',
				'src/lib/state/storage-contract.ts',
				'src/lib/state/storage-fixtures.ts'
			],
			reporter: ['text', 'json-summary'],
			// The storage layer holds everything the user has made, and the key vault
			// carries hard rule 2. Both are gated rather than merely measured.
			thresholds: {
				'src/lib/state/keys.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
				'src/lib/state/storage.ts': { statements: 100, branches: 90, functions: 100, lines: 100 },
				'src/lib/state/storage-memory.ts': {
					statements: 95,
					branches: 85,
					functions: 95,
					lines: 95
				},
				'src/lib/state/storage-idb.ts': { statements: 90, branches: 80, functions: 90, lines: 90 }
			}
		}
	},
	// Component tests need the browser build of Svelte (client `mount`), not the
	// server/SSR build vitest resolves to by default. See Svelte's Vitest guide.
	...(process.env.VITEST ? { resolve: { conditions: ['browser'] } } : {})
});
