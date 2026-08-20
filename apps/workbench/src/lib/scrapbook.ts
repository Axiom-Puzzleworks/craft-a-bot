import type { GroupRunRecord, RunRecord } from '@craftabot/core';

/**
 * **How an adventure reads on the shelf** (`16-…` §1.4).
 *
 * The Scrapbook's rows are the only place a child meets a run they are not
 * currently watching, so the whole row has to be legible at a glance: what
 * happened, to which bot, how long it took, and when. Pure functions, because
 * the wording is the feature and wording that lives in a template is wording
 * nobody can test.
 */

/** The face on the photo card. */
export function outcomeFace(outcome: RunRecord['outcome']): string {
	switch (outcome) {
		case 'SUCCESS':
			return '🥳';
		case 'OUT_OF_STEPS':
			return '😴';
		case 'STOPPED_BY_GUARDRAIL':
			return '🛡️';
		case 'STOPPED_BY_USER':
			return '✋';
		case 'ERROR':
			return '😖';
		case 'IN_PROGRESS':
			return '⏳';
	}
}

/**
 * What the face means, in words.
 *
 * Never colour or emoji alone (`04-…` §7): the face is the quick read and this
 * is the actual answer, and a screen reader gets only this.
 */
export function outcomeWords(outcome: RunRecord['outcome']): string {
	switch (outcome) {
		case 'SUCCESS':
			return 'Did it!';
		case 'OUT_OF_STEPS':
			return 'Ran out of steps';
		case 'STOPPED_BY_GUARDRAIL':
			return 'The Safety Brick stopped it';
		case 'STOPPED_BY_USER':
			return 'You stopped it';
		case 'ERROR':
			return 'Something went wrong';
		case 'IN_PROGRESS':
			// A run whose tab was shut. It is not a failure and should not read as
			// one — the child simply went away, and the story is still here.
			return 'Never finished';
	}
}

/**
 * "3 steps", and "1 step" rather than "1 steps" — the sort of thing a
 * five-year-old reads aloud and a grown-up then has to explain away.
 */
export function stepsWords(ticks: number): string {
	return ticks === 1 ? '1 step' : `${ticks} steps`;
}

/**
 * When it happened, in a form a child can place: today and yesterday by name,
 * anything older by date. Deliberately not "3 days ago" — relative times drift
 * as the page sits open, and a scrapbook is a thing you come back to.
 */
export function whenWords(iso: string, now: Date = new Date()): string {
	const then = new Date(iso);
	if (Number.isNaN(then.getTime())) return '';

	const startOfDay = (date: Date) =>
		new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
	const days = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);

	if (days === 0) return 'Today';
	if (days === 1) return 'Yesterday';
	return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * The runs belonging to one bot, newest first.
 *
 * Storage lists every run there is; the per-bot page filters here rather than
 * asking for a new index, because fifty rows is the entire cap.
 */
export function runsForAgent(runs: readonly RunRecord[], agentId: string): RunRecord[] {
	return runs.filter((run) => run.agentId === agentId);
}

/** "3 rounds", not "3 steps" — a shared adventure card's own unit (WP31, `24-…` §4.5). */
export function roundsWords(rounds: number): string {
	return rounds === 1 ? '1 round' : `${rounds} rounds`;
}

/** The group episodes either bot took part in, newest first — `runsForAgent`'s group counterpart. */
export function groupsForAgent(
	groups: readonly GroupRunRecord[],
	agentId: string
): GroupRunRecord[] {
	return groups.filter((group) => group.memberAgentIds.includes(agentId));
}
