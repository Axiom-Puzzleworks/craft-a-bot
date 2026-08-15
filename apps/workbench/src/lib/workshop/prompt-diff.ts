import type { EngineEvent } from '@craftabot/core';

/**
 * **"Diff vs previous prompt" — the memory-window lesson made visible**
 * (`17-…` §3, right region).
 *
 * The single most instructive thing the Workshop can show. A bot's prompt is
 * rebuilt every turn, and what changes between two turns *is* the memory
 * policy: the window slides, the oldest turn falls off the top, the newest
 * observation arrives at the bottom. Read as two walls of text nobody sees it.
 * Read as a diff it is obvious — and the moment a window size is too small, the
 * thing that fell off is right there, in red, next to the mistake it caused.
 *
 * Pure and event-shaped: it takes two `prompt.composed` payloads and returns
 * lines. No DOM, no formatting decisions.
 */

export type LineKind = 'same' | 'added' | 'removed';

export interface DiffLine {
	kind: LineKind;
	text: string;
}

export interface MessageDiff {
	role: string;
	/** Which section this is, in the composer's terms. */
	section: string;
	lines: DiffLine[];
	changed: boolean;
}

interface PromptMessage {
	role: string;
	content: string;
}

/**
 * The previous `prompt.composed` before `index`, or nothing if this is the
 * first.
 *
 * Searching backwards through the whole trace rather than assuming one prompt
 * per tick: a re-prompt after malformed output composes a second one in the
 * same turn, and *that* pair is among the most interesting diffs available —
 * it shows exactly what the engine added to get the bot back on track.
 */
export function previousPrompt(
	events: readonly EngineEvent[],
	index: number
): EngineEvent | undefined {
	for (let at = index - 1; at >= 0; at -= 1) {
		const event = events[at];
		if (event?.type === 'prompt.composed') return event;
	}
	return undefined;
}

/**
 * `system → memory → observation`, matching how the prompt is composed
 * (`02-…` §8) and how `PayloadView` already names them, so the two inspectors
 * do not use different words for the same section.
 */
export function sectionName(index: number, total: number): string {
	if (index === 0) return 'system';
	return index === total - 1 ? 'observation' : 'memory';
}

export function diffPrompts(
	previous: readonly PromptMessage[],
	current: readonly PromptMessage[]
): MessageDiff[] {
	const count = Math.max(previous.length, current.length);
	const diffs: MessageDiff[] = [];

	for (let index = 0; index < count; index += 1) {
		const before = previous[index];
		const after = current[index];
		// A message that exists on one side only is wholly added or wholly gone —
		// which is what happens when the memory section appears for the first time.
		const lines = diffLines(before?.content ?? '', after?.content ?? '');
		diffs.push({
			role: after?.role ?? before?.role ?? 'unknown',
			section: sectionName(index, count),
			lines,
			changed: lines.some((line) => line.kind !== 'same')
		});
	}

	return diffs;
}

/**
 * A line diff over the longest common subsequence.
 *
 * LCS rather than a line-by-line comparison, because the interesting change is
 * almost always an *insertion or deletion* — a turn falling off the top of the
 * window shifts every line after it, and a positional comparison would report
 * the entire prompt as changed and teach nobody anything.
 */
export function diffLines(before: string, after: string): DiffLine[] {
	const a = before === '' ? [] : before.split('\n');
	const b = after === '' ? [] : after.split('\n');

	// table[i][j] = length of the LCS of a[i..] and b[j..]
	const table: number[][] = Array.from({ length: a.length + 1 }, () =>
		new Array<number>(b.length + 1).fill(0)
	);
	for (let i = a.length - 1; i >= 0; i -= 1) {
		for (let j = b.length - 1; j >= 0; j -= 1) {
			const row = table[i] as number[];
			const next = table[i + 1] as number[];
			row[j] =
				a[i] === b[j]
					? (next[j + 1] as number) + 1
					: Math.max(next[j] as number, row[j + 1] as number);
		}
	}

	const lines: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			lines.push({ kind: 'same', text: a[i] as string });
			i += 1;
			j += 1;
		} else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
			lines.push({ kind: 'removed', text: a[i] as string });
			i += 1;
		} else {
			lines.push({ kind: 'added', text: b[j] as string });
			j += 1;
		}
	}
	while (i < a.length) lines.push({ kind: 'removed', text: a[i++] as string });
	while (j < b.length) lines.push({ kind: 'added', text: b[j++] as string });

	return lines;
}
