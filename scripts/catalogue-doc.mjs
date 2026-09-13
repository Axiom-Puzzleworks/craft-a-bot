#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * `docs/catalogue.md` from `@craftabot/governance`'s Guardrail Catalogue
 * (WP98, `docs/design-day2/86-CATALOGUE.md` §7): every entry with its
 * status, what implements it, its threats and its sources — the page a
 * governance reader asks for when they ask "what does this product have,
 * and what does it not claim?". Generated, never edited: `npm run
 * catalogue:doc` writes it; the build runs `--check` and fails when the
 * committed page is not what the content and the registry produce now, as
 * `docs/metrics.md` does. The registry is the default host's, so a
 * `shipped` entry's components are the ones that really resolve.
 */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO, 'docs', 'catalogue.md');
const GOVERNANCE = join(REPO, 'packages', 'governance', 'dist', 'index.js');
const REPORTS = join(REPO, 'packages', 'governance', 'dist', 'reports', 'index.js');
const HARNESS_CONFIG = join(REPO, 'packages', 'harness', 'dist', 'config.js');

for (const file of [GOVERNANCE, REPORTS, HARNESS_CONFIG]) {
	if (!existsSync(file)) {
		console.error(`catalogue-doc: no build at ${file}. Run \`npm run build\` first.`);
		process.exit(1);
	}
}
const { GUARDRAIL_CATALOGUE, checkCatalogue } = await import(pathToFileURL(GOVERNANCE).href);
const { renderCatalogueMarkdown } = await import(pathToFileURL(REPORTS).href);
const { createRegistry, defaultConfig } = await import(pathToFileURL(HARNESS_CONFIG).href);
const registry = createRegistry(defaultConfig());
const issues = checkCatalogue(GUARDRAIL_CATALOGUE, registry);
if (issues.length > 0) {
	console.error('catalogue-doc: the catalogue does not pass checkCatalogue:');
	for (const issue of issues)
		console.error(`  [${issue.check}] ${issue.entryId ?? ''} ${issue.message}`);
	process.exit(1);
}
const text = renderCatalogueMarkdown(GUARDRAIL_CATALOGUE, registry);

if (process.argv.includes('--check')) {
	const committed = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
	if (committed !== text) {
		console.error(
			'catalogue-doc: docs/catalogue.md is out of date — an entry or a component changed. Run `npm run catalogue:doc` and commit the page.'
		);
		process.exit(1);
	}
	console.log('catalogue-doc: docs/catalogue.md matches the catalogue');
} else {
	writeFileSync(OUT, text);
	console.log('catalogue-doc: wrote docs/catalogue.md');
}
