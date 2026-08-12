import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { workbenchRoot } from '../../test-support/paths.js';
import { describe, expect, it } from 'vitest';
import { ALL_ANCHORS, isAnchor } from './anchors.js';
import { CHAPTERS } from './chapters.js';

/**
 * Does every anchor point at something that exists in the markup?
 *
 * This has to read the source, not the `ANCHORS` object. An earlier version
 * asserted `isAnchor(step.anchor)` — where the anchor had come from `ANCHORS`
 * in the first place — so it was circular and could never fail. Renaming an id
 * passed it happily while leaving the arrow pointing at nothing.
 *
 * A missing anchor is silent in production: `Spotlight` just draws no cut-out.
 * That makes this the only thing standing between a component rename and a
 * tutorial that gestures at empty space.
 */

function svelteSources(dir: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) found.push(...svelteSources(path));
		else if (entry.name.endsWith('.svelte')) found.push(readFileSync(path, 'utf8'));
	}
	return found;
}

const markup = svelteSources(join(workbenchRoot(), 'src')).join('\n');

/** `data-tutorial="tray-{kind}"` covers `tray-llm`, `tray-sense`, and so on. */
function isPlacedInMarkup(anchor: string): boolean {
	if (markup.includes(`data-tutorial="${anchor}"`)) return true;
	const templated = /data-tutorial="([^"]*\{[^"]*)"/g;
	for (const match of markup.matchAll(templated)) {
		const pattern = match[1] ?? '';
		const prefix = pattern.slice(0, pattern.indexOf('{'));
		if (prefix !== '' && anchor.startsWith(prefix)) return true;
	}
	return false;
}

describe('every declared anchor is actually in the markup', () => {
	it('found some Svelte source to check', () => {
		// Guards the guard: an empty scan would make everything below vacuous.
		expect(markup.length).toBeGreaterThan(1000);
		expect(markup).toContain('data-tutorial');
	});

	it.each([...ALL_ANCHORS])('%s is placed on an element', (anchor) => {
		expect(isPlacedInMarkup(anchor)).toBe(true);
	});
});

describe('every anchor a chapter names is declared', () => {
	it('has no step pointing at an unknown id', () => {
		for (const chapter of CHAPTERS) {
			for (const step of chapter.steps) {
				if (step.anchor === undefined) continue;
				expect(isAnchor(step.anchor), `${chapter.id}/${step.id} → ${step.anchor}`).toBe(true);
				expect(isPlacedInMarkup(step.anchor), `${chapter.id}/${step.id}`).toBe(true);
			}
		}
	});
});
