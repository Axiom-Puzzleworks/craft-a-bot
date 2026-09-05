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
	['cream', 'red-fill', 'the "blocking" chip and the GO lever'],
	/*
	 * The nav header (`16-…` §1.5). Added because it was got wrong: the header
	 * first shipped `--cab-blue-text` on `--cab-blue`, which is the dark blue
	 * meant for blue text on paper and gives about 1.35:1 on a blue ground. It
	 * was invisible in the running app and no test objected, because this table
	 * only holds down the pairs somebody thought to add.
	 */
	['cream', 'blue', 'the nav header — Shelf, Instructions, Settings'],
	['ink', 'plastic-hi', 'the nav header entry for the screen you are on'],
	/*
	 * Secondary text (WP17 §2.7). Held at the full 4.5, not the large-text 3:1
	 * relief — quiet text is the *small* text, so the relief never applies to
	 * exactly the thing it would be claimed for. Both grounds are checked
	 * because hints and captions appear on cream panels and paper cards alike.
	 */
	['ink-muted', 'cream', 'hints, captions and other quiet text on a panel'],
	['ink-muted', 'paper', 'the same quiet text on a card'],
	['cream-muted', 'ink', 'the Flight Recorder’s row labels, on its dark ground']
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

/**
 * **The Workshop skin, held to exactly the same bar** (`15-…` §7 rule 5: "the
 * Workshop is not exempt because its users are adults").
 *
 * Read from inside the `[data-mode='workshop']` block rather than through
 * `token()`, which finds the first declaration in the file and would happily
 * audit the Kit's palette twice while the Workshop's went unchecked.
 *
 * This caught a real failure on the day the skin landed: the rail was a mid
 * panel grey with cream labels, which measures 3.2:1 — small text nobody could
 * read, on the one screen that is present on every Workshop route.
 */
const WORKSHOP = (() => {
	/*
	 * Comments are stripped first. They are long in this block and they *name*
	 * tokens while explaining why those tokens are deliberately absent — so a
	 * match against the raw text reads the prose as a declaration and reports
	 * the exact opposite of the truth.
	 */
	const withoutComments = TOKENS.replace(/\/\*[\s\S]*?\*\//g, '');
	const block = /\[data-mode='workshop'\]\s*\{([^}]*)\}/.exec(withoutComments);
	if (!block?.[1]) throw new Error('no [data-mode="workshop"] block in tokens.css');
	return block[1];
})();

function workshopToken(name: string): string {
	const match = new RegExp(`--cab-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(WORKSHOP);
	if (!match?.[1]) throw new Error(`no --cab-${name} in the workshop token layer`);
	return match[1];
}

/** Pairs the Workshop actually renders, all at 11–13px, so all at 4.5:1. */
const WORKSHOP_PAIRS: [string, string, string][] = [
	['cream', 'panel', 'rail labels on the instrument chrome'],
	['cream-muted', 'panel', 'rail entries for screens not yet built'],
	['ink', 'cream', 'table rows and cards'],
	['ink', 'paper', 'the page behind everything'],
	['ink-muted', 'cream', 'secondary detail in tables'],
	['ink-muted', 'paper', 'hints and captions'],
	['scope', 'cream', 'live telemetry accents'],
	// The Control Room's lane and status tokens are `:root`'s; the Workshop's grounds are darker, so they are checked here too.
	['counterpart', 'cream', 'the counterpart lane in the Workshop'],
	['counterpart', 'paper', 'the counterpart’s label on the Workshop’s page'],
	['truth', 'paper', 'the truth flap on the Workshop’s page'],
	['pass', 'paper', 'a pass verdict on the Workshop’s page'],
	['fail', 'paper', 'a fail verdict on the Workshop’s page'],
	['inconclusive', 'paper', 'an inconclusive verdict on the Workshop’s page']
];

/**
 * **The Control Room's tokens** (WP57, `44-CONTROL-ROOM.md` §4.1), on every
 * ground each one sits on — the Kit's cream and paper, the graph paper and
 * the metal, and the Workshop layer's darker cream and paper, read from
 * inside its block. Text pairs at 4.5:1; the two lane colours as borders at
 * 3:1 as well.
 */
const CONTROL_ROOM_TEXT_PAIRS: [string, string, string][] = [
	['engrave', 'metal', 'engraved labels on the brushed panel'],
	['ink', 'metal', 'values on a panel header'],
	['ink', 'graph', 'readouts on graph paper'],
	['ink-muted', 'graph', 'axis labels and units on graph paper'],
	['engrave', 'graph', 'engraved labels on graph paper'],
	['counterpart', 'cream', 'the counterpart’s speaker label in the Kit'],
	['counterpart', 'paper', 'the counterpart’s speaker label on a card'],
	['counterpart', 'graph', 'the counterpart lane in a Transcript'],
	['truth', 'cream', 'the truth flap’s label'],
	['truth', 'paper', 'the truth flap’s label on a card'],
	['pass', 'cream', 'a pass lamp’s label'],
	['pass', 'paper', 'a pass verdict in a table'],
	['pass', 'graph', 'a pass mark on an instrument'],
	['fail', 'cream', 'a fail lamp’s label'],
	['fail', 'paper', 'a fail verdict in a table'],
	['fail', 'graph', 'a fail mark on an instrument'],
	['inconclusive', 'cream', 'an inconclusive lamp’s label'],
	['inconclusive', 'paper', 'an inconclusive verdict in a table'],
	['inconclusive', 'graph', 'an inconclusive mark on an instrument']
];

const CONTROL_ROOM_NON_TEXT_PAIRS: [string, string, string][] = [
	['counterpart', 'cream', 'the counterpart lane’s border'],
	['truth', 'cream', 'the truth flap’s border'],
	['pass', 'graph', 'a pass lamp’s disc'],
	['fail', 'graph', 'a fail lamp’s disc']
];

describe('AA contrast for the Control Room’s tokens (4.5:1)', () => {
	it.each(CONTROL_ROOM_TEXT_PAIRS)('%s on %s — %s', (foreground, background) => {
		expect(ratio(token(foreground), token(background))).toBeGreaterThanOrEqual(4.5);
	});
});

describe('non-text contrast for the Control Room’s tokens (3:1)', () => {
	it.each(CONTROL_ROOM_NON_TEXT_PAIRS)('%s against %s — %s', (foreground, background) => {
		expect(ratio(token(foreground), token(background))).toBeGreaterThanOrEqual(3);
	});
});

describe('AA contrast in the Workshop skin (4.5:1)', () => {
	it.each(WORKSHOP_PAIRS)('%s on %s — %s', (foreground, background) => {
		const ROOT_ONLY = ['cream-muted', 'counterpart', 'truth', 'pass', 'fail', 'inconclusive'];
		const fg = ROOT_ONLY.includes(foreground) ? token(foreground) : workshopToken(foreground);
		expect(ratio(fg, workshopToken(background))).toBeGreaterThanOrEqual(4.5);
	});

	it('leaves the Playroom’s own colours alone', () => {
		/*
		 * `--cab-board` and `--cab-rug` are the bench and the Playroom floor. The
		 * Run Lab renders the same WorldView the Kit does, so a mode that
		 * recoloured the room would make two views of one run disagree about what
		 * it looked like — and `15-…` §5 confines this layer to surfaces and
		 * typography for exactly that reason.
		 */
		expect(WORKSHOP).not.toContain('--cab-board:');
		expect(WORKSHOP).not.toContain('--cab-rug:');
	});

	it('redefines no brick colour', () => {
		// §7 rule 1: a trace lane means the same thing in both modes.
		for (const brick of ['blue', 'green', 'purple', 'sky', 'red', 'yellow']) {
			expect(WORKSHOP, brick).not.toContain(`--cab-${brick}:`);
		}
	});
});
