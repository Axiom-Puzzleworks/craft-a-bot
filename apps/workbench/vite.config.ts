/// <reference types="vitest/config" />
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
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
		setupFiles: ['./vitest-setup.ts']
	},
	// Component tests need the browser build of Svelte (client `mount`), not the
	// server/SSR build vitest resolves to by default. See Svelte's Vitest guide.
	...(process.env.VITEST ? { resolve: { conditions: ['browser'] } } : {})
});
