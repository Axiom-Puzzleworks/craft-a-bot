import type { GroupRunRecord, RunRecord } from '@craftabot/core';

/**
 * **Which runs the Run Browser is showing** (`17-…` §4.3).
 *
 * A pure function over the records, kept out of the component for the usual
 * reason: filtering is the part with the edge cases — an empty filter is not
 * the same as a filter that matches nothing, and a run still in progress has no
 * `finishedAt` to sort on — and none of that needs a DOM to be sure about.
 *
 * The facets are derived from the runs rather than declared. A hard-coded list
 * of cartridges would go stale the moment a pack added one, and would offer the
 * user a filter that matches nothing while hiding one that matters.
 */

/**
 * Every field is explicitly `| undefined` rather than merely optional.
 *
 * `exactOptionalPropertyTypes` is on across the repo, and here absent and
 * `undefined` genuinely mean the same thing: "any". The alternative is deleting
 * keys to clear a filter, which is fiddlier at every call site and invites the
 * bug where clearing one filter silently drops another.
 */
export interface RunFilter {
	/** Free text over bot name, card and model. */
	text?: string | undefined;
	agentId?: string | undefined;
	goalCardId?: string | undefined;
	outcome?: string | undefined;
	providerId?: string | undefined;
	pinnedOnly?: boolean | undefined;
}

export const EMPTY_FILTER: RunFilter = {};

export interface RunFacets {
	bots: { id: string; label: string }[];
	cards: string[];
	outcomes: string[];
	providers: string[];
}

/**
 * Newest first, and **pinned runs are not floated to the top**.
 *
 * A tempting default, and wrong here: the Run Browser is a forensic list, so
 * the ordering has to be a fact about the runs rather than a fact about what
 * somebody starred. The Kit's scrapbook may reasonably do the opposite — it is
 * a keepsake shelf.
 */
export function filterRuns(runs: readonly RunRecord[], filter: RunFilter): RunRecord[] {
	const needle = filter.text?.trim().toLowerCase();

	return runs
		.filter((run) => {
			if (filter.pinnedOnly === true && !run.pinned) return false;
			if (filter.agentId !== undefined && run.agentId !== filter.agentId) return false;
			if (filter.goalCardId !== undefined && run.goalCardId !== filter.goalCardId) return false;
			if (filter.outcome !== undefined && run.outcome !== filter.outcome) return false;
			if (filter.providerId !== undefined && run.providerId !== filter.providerId) return false;
			if (needle !== undefined && needle !== '' && !matchesText(run, needle)) return false;
			return true;
		})
		.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function matchesText(run: RunRecord, needle: string): boolean {
	// The model as well as the cartridge: "which runs used gpt-4o-mini" is a
	// question an audit asks, and `providerId` alone cannot answer it.
	return [run.agentName, run.goalCardId, run.providerId, run.wireModel, run.id].some((field) =>
		field.toLowerCase().includes(needle)
	);
}

export function facetsOf(runs: readonly RunRecord[]): RunFacets {
	const bots = new Map<string, string>();
	const cards = new Set<string>();
	const outcomes = new Set<string>();
	const providers = new Set<string>();

	for (const run of runs) {
		bots.set(run.agentId, run.agentName);
		cards.add(run.goalCardId);
		outcomes.add(run.outcome);
		providers.add(run.providerId);
	}

	return {
		bots: [...bots].map(([id, label]) => ({ id, label })).sort(byLabel),
		cards: [...cards].sort(),
		outcomes: [...outcomes].sort(),
		providers: [...providers].sort()
	};
}

const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);

/**
 * How long a run took, or `undefined` while it is still going. Takes just the
 * two timestamps — `GroupRunRecord` carries the same pair for the same
 * reason (WP29) — rather than a whole `RunRecord`.
 */
export function durationMs(record: {
	startedAt: string;
	finishedAt?: string | undefined;
}): number | undefined {
	if (record.finishedAt === undefined) return undefined;
	return Date.parse(record.finishedAt) - Date.parse(record.startedAt);
}

/**
 * One row of the Run Browser's table: an ordinary solo run, or a group
 * episode's own row with its (already-filtered) member rows nested beneath it
 * (WP29, `23-MULTI-AGENT-DESIGN.md` §5.2, §10 stage F — "the Run Browser
 * groups an episode's rows: the two member runs indented under the group row").
 */
export type RunBrowserRow =
	{ kind: 'run'; run: RunRecord } | { kind: 'group'; group: GroupRunRecord; members: RunRecord[] };

/**
 * Folds `filterRuns`'s own output into browser rows — filtering itself is
 * untouched (`filterRuns` still runs on plain `RunRecord[]`, exactly as
 * before WP29), so a solo-only store behaves byte-identically. A member run
 * only appears grouped when its own `GroupRunRecord` is actually loaded;
 * one that vanished (deleted out from under it) falls back to its own row
 * rather than disappearing.
 *
 * A group's row lands at the position of the *first* of its members to
 * appear in `runs`, which is already sorted — so the group sits exactly
 * where its most-relevant member would have sat alone. A group whose every
 * member the current filter hides never appears at all.
 */
export function groupRows(
	runs: readonly RunRecord[],
	groupRuns: readonly GroupRunRecord[]
): RunBrowserRow[] {
	const byId = new Map(groupRuns.map((group) => [group.id, group]));
	const placed = new Set<string>();
	const rows: RunBrowserRow[] = [];

	for (const run of runs) {
		const group = run.groupRunId !== undefined ? byId.get(run.groupRunId) : undefined;
		if (!group) {
			rows.push({ kind: 'run', run });
			continue;
		}
		if (placed.has(group.id)) continue;
		placed.add(group.id);
		rows.push({
			kind: 'group',
			group,
			members: runs.filter((candidate) => candidate.groupRunId === group.id)
		});
	}

	return rows;
}
