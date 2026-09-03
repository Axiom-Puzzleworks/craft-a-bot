#!/usr/bin/env node
/**
 * Every export of `@craftabot/governance` carries a doc comment (WP50,
 * `38-GOVERNANCE-1-0.md` §4.1). Walks the two barrels, follows each
 * `export { … } from './x.js'` to the symbol's declaration, and reports any
 * declaration not immediately preceded by a `/** … *\/` block. Run as a
 * test (`src/exports.test.ts`) so the rule outlives the WP that set it.
 *
 * Usage: node scripts/governance-exports.mjs [packageDir]
 * Exit 1 with the offending symbols listed when any export is undocumented.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? join(process.cwd(), 'packages/governance'));
const BARRELS = ['src/index.ts', 'src/reports/index.ts'];

/** `export { a, b as c, type D } from './x.js'` → [{ names, from }] and local `export const` names. */
function exportsOf(file) {
	const text = readFileSync(file, 'utf8');
	const reexports = [];
	for (const match of text.matchAll(/export\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
		const names = match[1]
			.split(',')
			.map((entry) => entry.trim())
			.filter(Boolean)
			.map((entry) =>
				entry
					.replace(/^type\s+/, '')
					.split(/\s+as\s+/)[0]
					.trim()
			);
		reexports.push({ names, from: match[2] });
	}
	const locals = [
		...text.matchAll(/^export\s+(?:const|function|interface|type|class)\s+([A-Za-z_$][\w$]*)/gm)
	].map((match) => match[1]);
	return { text, reexports, locals };
}

/** Whether the export of `name` in `text` is preceded by a doc comment. */
function documented(text, name) {
	const pattern = new RegExp(
		`^export\\s+(?:declare\\s+)?(?:async\\s+)?(?:const|let|function\\*?|interface|type|class|enum)\\s+${name}\\b`,
		'm'
	);
	const match = pattern.exec(text);
	if (!match) return { found: false };
	const before = text.slice(0, match.index).trimEnd();
	return {
		found: true,
		ok: before.endsWith('*/') && /\/\*\*[\s\S]*\*\/$/.test(before.slice(-4000))
	};
}

const problems = [];
for (const barrel of BARRELS) {
	const file = join(root, barrel);
	const { text, reexports, locals } = exportsOf(file);
	for (const name of locals) {
		const result = documented(text, name);
		if (!result.ok) problems.push(`${barrel}: ${name}`);
	}
	for (const { names, from } of reexports) {
		const source = resolve(dirname(file), from.replace(/\.js$/, '.ts'));
		const sourceText = readFileSync(source, 'utf8');
		for (const name of names) {
			const result = documented(sourceText, name);
			if (!result.found)
				problems.push(`${from}: ${name} (not declared with an export keyword at its declaration)`);
			else if (!result.ok) problems.push(`${from}: ${name}`);
		}
	}
}

if (problems.length > 0) {
	console.error(`undocumented exports (${problems.length}):\n  ${problems.join('\n  ')}`);
	process.exit(1);
}
console.log('every export of @craftabot/governance carries a doc comment');
