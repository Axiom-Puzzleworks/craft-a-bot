import type {
	ContentRecord,
	ExperimentResult,
	RunRecord,
	StoredCampaignReport,
	StoredWorkflowRun
} from '@craftabot/core';
import { RAIL_HREF, railLabel, vocab, type Lens } from './lens.js';
import { viewHref, viewsFor } from './views.js';

/**
 * **The command palette's fold** (WP109, `96-CONTROL-ROOM-V3.md` §2.1;
 * `83-…` §6.7.1): every route the lens's rail lists, every stored artefact
 * by id and title, every action a screen has registered — ranked against
 * a query by a subsequence match that prefers a word start. Pure over its
 * inputs; the dialog (`CommandPalette.svelte`) only renders what this
 * returns.
 */
export type PaletteKind = 'route' | 'artefact' | 'action' | 'view';

export interface PaletteEntry {
	kind: PaletteKind;
	/** Stable across renders: a route path, an artefact id, an action id. */
	id: string;
	title: string;
	/** The second line: the artefact's kind in the lens's words, an action's screen, a route's group. */
	hint?: string | undefined;
	/** Where `Enter` goes — a path without the base, `?search` included. */
	href?: string | undefined;
	/** What `Enter` does instead, for an action. */
	run?: (() => void) | undefined;
	/** Extra words the match may land on: an id's prefix, a bot's name. */
	keywords?: readonly string[] | undefined;
}

export const PALETTE_LIMIT = 12;

/** Every destination on the lens's rail, labelled as the rail labels it, in the lens's groups. */
export function routeEntries(lens: Lens): PaletteEntry[] {
	const out: PaletteEntry[] = [];
	for (const group of lens.rail) {
		for (const id of group.routes) {
			const href = RAIL_HREF[id];
			if (!href) continue;
			out.push({
				kind: 'route',
				id: href,
				title: railLabel(lens, id),
				hint: lens.rail.length > 1 ? group.group : 'Workshop',
				href,
				keywords: [id]
			});
		}
	}
	return out;
}

export interface PaletteStore {
	runs?: readonly RunRecord[] | undefined;
	reports?: readonly StoredCampaignReport[] | undefined;
	workflowRuns?: readonly StoredWorkflowRun[] | undefined;
	experiments?: readonly ExperimentResult[] | undefined;
	content?: readonly ContentRecord[] | undefined;
}

const short = (id: string): string => (id.length > 12 ? `${id.slice(0, 8)}…` : id);

/** Every stored artefact, by id and title, its kind said in the lens's words. */
export function artefactEntries(store: PaletteStore, lens: Lens): PaletteEntry[] {
	const out: PaletteEntry[] = [];
	for (const run of store.runs ?? []) {
		out.push({
			kind: 'artefact',
			id: run.id,
			title: `${run.agentName} — ${run.goalCardId}`,
			hint: `${vocab(lens, 'run')} ${short(run.id)} · ${run.outcome}`,
			href: `/workshop/runs/${run.id}`,
			keywords: [run.id, run.outcome, run.startedAt.slice(0, 10)]
		});
	}
	for (const report of store.reports ?? []) {
		out.push({
			kind: 'artefact',
			id: report.id,
			title: report.title,
			hint: `${vocab(lens, 'campaign')} report ${short(report.id)} · ${report.passed ? 'passed' : 'failed'}`,
			href: `/workshop/campaigns?report=${encodeURIComponent(report.id)}`,
			keywords: [report.id, report.campaignId]
		});
	}
	for (const stored of store.workflowRuns ?? []) {
		const item = stored.item ? ` · ${stored.item.kind} ${short(stored.item.id)}` : '';
		out.push({
			kind: 'artefact',
			id: stored.run.id,
			title: `${stored.run.workflowId}${item}`,
			hint: `${vocab(lens, 'workflow')} run ${short(stored.run.id)} · ${stored.run.outcome}`,
			href: `/workshop/workflows/${stored.run.id}`,
			keywords: [stored.run.id, stored.run.workflowId, stored.item?.id ?? '']
		});
	}
	for (const result of store.experiments ?? []) {
		out.push({
			kind: 'artefact',
			id: result.id,
			title: result.title,
			hint: `experiment result ${short(result.id)}`,
			href: `/workshop/experiments?result=${encodeURIComponent(result.id)}`,
			keywords: [result.id, result.experimentId]
		});
	}
	for (const record of store.content ?? []) {
		if (record.kind === 'stack') {
			out.push({
				kind: 'artefact',
				id: record.id,
				title: record.title,
				hint: `stack ${record.id}`,
				href: `/workshop/studio?stack=${encodeURIComponent(record.id)}`,
				keywords: [record.id]
			});
		}
	}
	for (const view of viewsFor(store.content ?? [], lens.id)) {
		out.push({
			kind: 'view',
			id: view.id,
			title: view.title,
			hint: `saved view · ${view.route}`,
			href: viewHref(view),
			keywords: [view.route]
		});
	}
	return out;
}

const KIND_ORDER: Record<PaletteKind, number> = { action: 0, route: 1, view: 2, artefact: 3 };

/**
 * A subsequence match: every character of the query, in order, somewhere in
 * the text. Scored by where it lands — a run of matches at the start of a
 * word scores more than one buried in an id — and, on a tie, by the shorter
 * text. `undefined` when the query does not fit.
 */
export function matchScore(query: string, text: string): number | undefined {
	const q = query.toLowerCase();
	const t = text.toLowerCase();
	if (q.length === 0) return 0;
	let score = 0;
	let at = 0;
	let streak = 0;
	for (const char of q) {
		if (char === ' ') continue;
		const found = t.indexOf(char, at);
		if (found === -1) return undefined;
		const wordStart = found === 0 || /[\s/\-—·:_]/.test(t[found - 1] ?? '');
		const adjacent = found === at && at > 0;
		streak = adjacent ? streak + 1 : 0;
		score += (wordStart ? 10 : 1) + streak * 3 - Math.min(found - at, 20) * 0.1;
		at = found + 1;
	}
	if (t.startsWith(q)) score += 25;
	return score - t.length * 0.01;
}

/** The entries that fit the query, best first, at most `limit`; an empty query lists them in kind order. */
export function rankPalette(
	entries: readonly PaletteEntry[],
	query: string,
	limit = PALETTE_LIMIT
): PaletteEntry[] {
	const trimmed = query.trim();
	const scored = entries.flatMap((entry) => {
		if (trimmed === '') return [{ entry, score: 0 }];
		const texts = [entry.title, ...(entry.keywords ?? []), entry.hint ?? ''];
		const best = texts.reduce<number | undefined>((acc, text) => {
			const s = matchScore(trimmed, text);
			return s === undefined ? acc : acc === undefined ? s : Math.max(acc, s);
		}, undefined);
		return best === undefined ? [] : [{ entry, score: best }];
	});
	scored.sort(
		(a, b) =>
			b.score - a.score ||
			KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind] ||
			a.entry.title.localeCompare(b.entry.title)
	);
	return scored.slice(0, limit).map((row) => row.entry);
}
