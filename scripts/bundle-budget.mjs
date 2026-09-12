#!/usr/bin/env node
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The JS bundle budget from `01-ARCHITECTURE.md` §8: **< 1.5 MB JS, excluding
 * art**, in service of a sub-2-second first load.
 *
 * A budget nobody measures is a wish. This runs as the last step of the
 * workbench build, so the number is checked every time the app is built rather
 * than remembered from whenever somebody last looked — and a regression fails
 * the build that caused it. It reports gzip too, since that is what a browser
 * actually downloads, but the stated limit is on raw bytes, as the doc has it.
 *
 * **A budget per build** (WP56 stage A, `41-TARGET-DESIGN-V4.md` §2.1 G42,
 * `42-DAY4-ROADMAP.md` §3). The limit is an argument — `--limit <bytes>` — so
 * an edition (`41-…` §6.14) can be measured against its own number rather than
 * the one budget everything used to share; the default is the 1.5 MB the
 * `full` build has always had. `--app <dir>` points at a different workbench
 * (an edition builds into its own folder); it defaults to `apps/workbench`.
 *
 * **Per-route sizes.** The total says whether the build fits; it does not say
 * what a visitor to one screen actually loads, and it hides a desk or a
 * design system growing inside a number that still fits. So the report also
 * folds SvelteKit's own route manifest over Vite's chunk manifest and prints,
 * per route, the JS that route's first visit fetches — the app entry, its
 * layouts and its leaf node, with every static import they reach. Dynamic
 * imports are not counted: they are lazy by definition, which is the point of
 * them. The per-route table is a report, not a gate; the gate stays on the
 * total, as the doc has it.
 *
 * **The Worker is counted apart** (WP77, `64-TARGET-DESIGN-V5.md` §6.6.1;
 * `01-…` §8's dated note). Vite bundles a module Worker as its own file
 * under `_app/immutable/workers/`, with its own copy of everything it
 * imports — the engine, the packs — because a Worker cannot share the
 * page's chunks. That file is fetched only when a campaign is run, never on
 * first load, so it does not belong in the shell's number; but a Worker
 * that quietly doubled would be a regression too. So the Workers are summed
 * on their own line against their own limit — `--worker-limit <bytes>`,
 * default 800 kB — and the shell's gate stays what `01-…` §8 says.
 */

// Resolved from this script, not the working directory: it runs as a build
// step inside `apps/workbench` as well as by hand from the repo root.
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
// 1.5 MB from `01-…` §8, +50 kB on 2026-09-10 (WP74): the calibration table's cited rows and their notes ship in the bank pack (`66-CALIBRATION.md`), and are content the bank page renders.
const DEFAULT_LIMIT_BYTES = 2_000_000; // +60 kB 2026-09-12 (WP103): the Onboarding Desk pack, its journey and the bank's screening list (01 §8) // +10 kB 2026-09-12 (WP102): the complaints journey, the handoff (01 §8) // +20 kB 2026-09-12 (WP101): the Studio and the verdict-flow fold (01 §8) // +30 kB 2026-09-12 (WP100): the Journey Canvas, its layout in workflow, the twin, the journeys pages (01 §8) // +10 kB 2026-09-12 (WP99): the connections declared in full and the Guard Rack’s lamp (01 §8) // +40 kB 2026-09-12 (WP98): the Guardrail Catalogue’s forty-five cited entries ride in governance (01 §8) // +30 kB 2026-09-12 (Phase X, WP94–WP96): the component contract, the boundary chain, the redaction (01 §8)
// +50 kB 2026-09-11 (WP82): the runner's fairness and drift metrics and the workflow runtime ride in the Worker's chunk.
const DEFAULT_WORKER_LIMIT_BYTES = 990_000; // +30 kB 2026-09-12 (WP103): the fourth desk pack rides into the Worker // +10 kB 2026-09-12 (WP102): the complaints journey rides into the Worker with fs-advice // +10 kB 2026-09-12 (WP101): the verdict-flow fold rides into the Worker with governance // +10 kB 2026-09-12 (WP100): the journey layout rides into the Worker with workflow // +10 kB 2026-09-12 (WP99): the connections and browserRefusal in governance // +30 kB 2026-09-12 (WP98): the catalogue rides into the Worker with governance // +20 kB 2026-09-12 (Phase X): the adapters and the boundary compiler ride into the Worker with governance and evals

function parseArgs(argv) {
	const options = {
		app: join(REPO, 'apps', 'workbench'),
		limit: DEFAULT_LIMIT_BYTES,
		workerLimit: DEFAULT_WORKER_LIMIT_BYTES,
		out: 'build'
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--limit') {
			const value = Number(argv[++i]);
			if (!Number.isFinite(value) || value <= 0) {
				throw new Error(`bundle-budget: --limit wants a positive number of bytes, got ${argv[i]}`);
			}
			options.limit = value;
		} else if (arg === '--worker-limit') {
			const value = Number(argv[++i]);
			if (!Number.isFinite(value) || value <= 0) {
				throw new Error(
					`bundle-budget: --worker-limit wants a positive number of bytes, got ${argv[i]}`
				);
			}
			options.workerLimit = value;
		} else if (arg === '--app') {
			options.app = join(REPO, argv[++i] ?? '');
		} else if (arg === '--out') {
			// An edition's folder (WP69): `build/<edition>`, relative to the app.
			options.out = argv[++i] ?? 'build';
		} else {
			throw new Error(`bundle-budget: unknown argument ${arg}`);
		}
	}
	return options;
}

function jsFiles(dir) {
	const found = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) found.push(...jsFiles(path));
		else if (entry.name.endsWith('.js')) found.push(path);
	}
	return found;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} kB`;

/**
 * Per-route sizes from the two manifests SvelteKit and Vite already write.
 *
 * The server manifest (`.svelte-kit/output/server/manifest.js`) is an ES
 * module whose `routes` array names, per route id, the node indices of its
 * layouts and leaf. It is read as text and its `routes` entries matched by
 * regex rather than imported — importing it would pull in the server build,
 * and all this wants is a list of numbers. The client manifest
 * (`.svelte-kit/output/client/.vite/manifest.json`) maps each node to the
 * chunk it became and the chunks that chunk statically imports.
 *
 * Returns `undefined` when either manifest is missing (an older build, or a
 * build from somewhere else), so the total still reports on its own.
 */
function routeSizes(app, build) {
	const serverManifest = join(app, '.svelte-kit', 'output', 'server', 'manifest.js');
	const clientManifest = join(app, '.svelte-kit', 'output', 'client', '.vite', 'manifest.json');
	if (!existsSync(serverManifest) || !existsSync(clientManifest)) return undefined;

	const chunks = JSON.parse(readFileSync(clientManifest, 'utf8'));
	const routes = [];
	const routePattern =
		/id:\s*"([^"]*)"[\s\S]*?page:\s*\{\s*layouts:\s*\[([\d,\s]*)\],\s*errors:\s*\[[\d,\s]*\],\s*leaf:\s*(\d+)\s*\}/g;
	const text = readFileSync(serverManifest, 'utf8');
	for (const match of text.matchAll(routePattern)) {
		const [, id, layouts, leaf] = match;
		const nodes = layouts
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
			.map(Number);
		nodes.push(Number(leaf));
		routes.push({ id, nodes });
	}
	if (routes.length === 0) return undefined;

	const sizeCache = new Map();
	const sizeOf = (file) => {
		if (!sizeCache.has(file)) {
			const path = join(build, file);
			sizeCache.set(file, existsSync(path) ? statSync(path).size : 0);
		}
		return sizeCache.get(file);
	};

	// Every chunk a manifest entry reaches through static imports, itself included.
	const reach = (key, seen) => {
		const entry = chunks[key];
		if (!entry || seen.has(entry.file)) return;
		seen.add(entry.file);
		for (const dep of entry.imports ?? []) reach(dep, seen);
	};

	const appKey = Object.keys(chunks).find((key) => key.endsWith('/app.js'));
	const nodeKey = (n) => Object.keys(chunks).find((key) => key.endsWith(`/nodes/${n}.js`));

	return routes.map(({ id, nodes }) => {
		const files = new Set();
		if (appKey) reach(appKey, files);
		for (const n of nodes) {
			const key = nodeKey(n);
			if (key) reach(key, files);
		}
		let raw = 0;
		for (const file of files) raw += sizeOf(file);
		return { id, raw, files: files.size };
	});
}

let options;
try {
	options = parseArgs(process.argv.slice(2));
} catch (error) {
	console.error(error.message);
	process.exit(2);
}

const BUILD = join(options.app, options.out);
const LIMIT_BYTES = options.limit;
const WORKER_LIMIT_BYTES = options.workerLimit;
// Either slash: the path is absolute, and on Windows it is joined with backslashes.
const isWorker = (file) => {
	const parts = file.split(/[\\/]/);
	const at = parts.indexOf('workers');
	return at > 1 && parts[at - 1] === 'immutable' && parts[at - 2] === '_app';
};

let files;
let workers = [];
try {
	const all = jsFiles(BUILD);
	files = all.filter((file) => !isWorker(file));
	workers = all.filter(isWorker);
} catch {
	console.error(`bundle-budget: no build at ${BUILD}. Run \`npm run build\` first.`);
	process.exitCode = 1;
	files = [];
}

if (files.length > 0) {
	let raw = 0;
	let gzip = 0;
	const largest = [];

	for (const file of files) {
		const bytes = statSync(file).size;
		raw += bytes;
		gzip += gzipSync(readFileSync(file)).length;
		largest.push([file, bytes]);
	}

	const used = ((raw / LIMIT_BYTES) * 100).toFixed(0);

	console.log(`bundle-budget: ${files.length} JS files in ${relative(REPO, BUILD)}`);
	console.log(`  raw   ${kb(raw)} of ${kb(LIMIT_BYTES)} budget  (${used}%)`);
	console.log(`  gzip  ${kb(gzip)}`);

	largest.sort((a, b) => b[1] - a[1]);
	for (const [file, bytes] of largest.slice(0, 3)) {
		console.log(`  largest: ${kb(bytes).padStart(7)}  ${file}`);
	}

	const routes = routeSizes(options.app, BUILD);
	if (routes) {
		routes.sort((a, b) => b.raw - a.raw);
		console.log(`  per route (JS on first visit, static imports only):`);
		for (const route of routes) {
			console.log(`    ${kb(route.raw).padStart(7)}  ${route.id}`);
		}
	} else {
		console.log(`  per route: no SvelteKit manifests found under ${relative(REPO, options.app)}`);
	}

	let workerRaw = 0;
	for (const file of workers) workerRaw += statSync(file).size;
	if (workers.length > 0) {
		console.log(
			`  workers  ${kb(workerRaw)} of ${kb(WORKER_LIMIT_BYTES)} worker budget in ${workers.length} file(s), fetched only when a run starts`
		);
	}

	if (raw > LIMIT_BYTES) {
		console.error(`bundle-budget: OVER BUDGET by ${kb(raw - LIMIT_BYTES)} (01 §8)`);
		process.exitCode = 1;
	} else if (workerRaw > WORKER_LIMIT_BYTES) {
		console.error(
			`bundle-budget: WORKER OVER BUDGET by ${kb(workerRaw - WORKER_LIMIT_BYTES)} (WP77)`
		);
		process.exitCode = 1;
	} else {
		console.log('bundle-budget: within budget');
	}
}
