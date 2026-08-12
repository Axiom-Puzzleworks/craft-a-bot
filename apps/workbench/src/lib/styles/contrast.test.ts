import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { workbenchRoot } from '../../test-support/paths.js';

/**
 * The WCAG 2.1 AA contrast audit (`01-ARCHITECTURE.md` §8,
 * `04-VISUAL-DESIGN-LANGUAGE.md` §7).
 *
 * Deliberately parses `tokens.css` rather than restating the palette. A table
 * copied into a test drifts from the stylesheet the moment somebody nudges a
 * hex, and then reassures everybody about a palette that no longer exists.
 *
 * It also encodes the *right* threshold per pair. WCAG's "large text" relief
 * (3:1) starts at 18.66px bold or 24px regular; the chips in the build-checks
 * ribbon are `--cab-text-xs`, which is 11px, so they get no relief at all. That
 * distinction is what turned this from a clean bill of health into three real
 * failures.
 */

const TOKENS = readFileSync(join(workbenchRoot(), 'src/lib/styles/tokens.css'), 'utf8');

function token(name: string): string {
	const match = new RegExp(`--cab-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(TOKENS);
	if (!match?.[1]) throw new Error(`no --cab-${name} in tokens.css`);
	return match[1];
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
	const value = Number.parseInt(hex.slice(1), 16);
	const channel = (raw: number) => {
		const c = raw / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return (
		0.2126 * channel((value >> 16) & 255) +
		0.7152 * channel((value >> 8) & 255) +
		0.0722 * channel(value & 255)
	);
}

function ratio(foreground: string, background: string): number {
	const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
	return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

const WHITE = '#ffffff';

/** Pairs the app actually renders, with the size class each is used at. */
const BODY_PAIRS: [string, string, string][] = [
	['ink', 'cream', 'body copy everywhere'],
	['ink', 'paper', 'the leaflet and panels'],
	['ink', 'yellow', 'warning chips and the leaflet handle'],
	['blue-text', 'cream', 'headings and links'],
	['red-text', 'cream', 'errors'],
	['green-text', 'cream', 'trace ticks'],
	['purple-text', 'cream', 'tool lane'],
	['cream', 'green-fill', 'the "ready" chip and the STEP button'],
	['cream', 'red-fill', 'the "blocking" chip and the GO lever']
];

/**
 * Never carries text, so the 3:1 non-text rule applies instead (WCAG 1.4.11).
 *
 * A single shade cannot satisfy both light and dark text at 4.5:1, which is why
 * the ink-on-green buttons moved to cream on `--cab-green-fill` rather than
 * getting a green pale enough for ink.
 */
const NON_TEXT_PAIRS: [string, string, string][] = [
	['sky', 'cream', 'the paused status lamp — a state indicator, so 3:1 applies'],
	['green', 'cream', 'brick tints and borders'],
	['red', 'cream', 'brick tints and borders']
];

describe('AA contrast for text (4.5:1)', () => {
	it.each(BODY_PAIRS)('%s on %s — %s', (foreground, background) => {
		expect(ratio(token(foreground), token(background))).toBeGreaterThanOrEqual(4.5);
	});
});

describe('white on the strong fills, at 16px semibold and above', () => {
	// `04` §7 permits white on these. 16px semibold is *not* WCAG large text, so
	// they are held to 4.5 as well — which is how the green failure was found.
	it.each([['blue'], ['red-fill'], ['purple']])('white on %s', (background) => {
		expect(ratio(WHITE, token(background))).toBeGreaterThanOrEqual(4.5);
	});
});

describe('non-text contrast (3:1)', () => {
	it.each(NON_TEXT_PAIRS)('%s against %s — %s', (foreground, background) => {
		expect(ratio(token(foreground), token(background))).toBeGreaterThanOrEqual(3);
	});
});

describe('the pairs 04 §7 forbids', () => {
	it('white on yellow really does fail, so the ban is justified', () => {
		expect(ratio(WHITE, token('yellow'))).toBeLessThan(4.5);
	});

	it('white on sky really does fail too', () => {
		expect(ratio(WHITE, token('sky'))).toBeLessThan(4.5);
	});
});
