#!/usr/bin/env node
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * **A static host for the site, as `docs/publishing.md` describes one**
 * (`59-EDITIONS.md` §4.5, WP69): serves `apps/workbench/build/` — the `full`
 * build at `/` and the three edition folders at `/simulator/`, `/workshop/`
 * and `/playground/` — with **one SPA fallback per folder**, the rewrite
 * rule every static host needs. `vite preview` has one fallback for the
 * whole tree (the `full` build's `index.html`), so under it a request for
 * `/playground/` never reaches the Playground's own document; this is what
 * the editions' smoke specs run against, and what a deployment looks like.
 *
 *   node scripts/serve-site.mjs [--port 4173] [--root apps/workbench/build]
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const at = args.indexOf(`--${name}`);
	return at === -1 ? fallback : args[at + 1];
};
const PORT = Number(flag('port', '4173'));
const ROOT = join(REPO, flag('root', 'apps/workbench/build'));
const SECTIONS = ['simulator', 'workshop', 'playground'];

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.txt': 'text/plain; charset=utf-8',
	'.woff2': 'font/woff2',
	'.webmanifest': 'application/manifest+json'
};

function fileAt(path) {
	const full = normalize(join(ROOT, path));
	if (!full.startsWith(ROOT)) return undefined;
	if (existsSync(full) && statSync(full).isFile()) return full;
	return undefined;
}

/** The document a path falls back to: its section's `index.html`, or the root's. */
function fallbackFor(pathname) {
	const section = SECTIONS.find(
		(name) => pathname === `/${name}` || pathname.startsWith(`/${name}/`)
	);
	return join(ROOT, section ?? '', 'index.html');
}

const server = createServer((request, response) => {
	const url = new URL(request.url ?? '/', `http://localhost:${PORT}`);
	let pathname = decodeURIComponent(url.pathname);
	// A section's root without the slash: send the browser to the folder, as a host does.
	if (SECTIONS.includes(pathname.slice(1))) {
		response.writeHead(308, { location: `${pathname}/` });
		response.end();
		return;
	}
	if (pathname.endsWith('/')) pathname += 'index.html';
	let file = fileAt(pathname);
	if (!file) {
		if (extname(pathname) !== '' && extname(pathname) !== '.html') {
			response.writeHead(404);
			response.end('not found');
			return;
		}
		file = fallbackFor(url.pathname);
	}
	const body = readFileSync(file);
	response.writeHead(200, {
		'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
		'content-length': body.length,
		'cache-control': 'no-cache'
	});
	response.end(body);
});

server.listen(PORT, () => {
	console.log(
		`serve-site: ${ROOT} at http://localhost:${PORT}/ — sections: ${SECTIONS.map((s) => `/${s}/`).join(' ')}`
	);
});
