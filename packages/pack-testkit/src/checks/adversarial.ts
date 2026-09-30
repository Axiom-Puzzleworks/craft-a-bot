import {
	ADVERSARIAL_STATE_KIND,
	ATTACK_KINDS,
	ATTACK_TARGETS,
	adversarialLabels,
	adversarialStateSchema,
	canonicalJson,
	type AttackSurface,
	type Corpus
} from '@craftabot/core';
import type { ConformanceIssue } from '../types.js';
import { checkCorpus } from './corpus.js';

/** The benign share below which a corpus cannot measure a guard's false alarms (`106-BENCHMARK.md` §4). */
export const MIN_BENIGN_SHARE = 0.25;

/**
 * **An adversarial corpus's conformance** (WP122, `106-BENCHMARK.md` §5):
 * `checkCorpus`'s six refusals, then six of its own.
 *
 * - `adversarial.state-kind` — the corpus says its rows are `attack-surface` states.
 * - `adversarial.labels` — exactly the shared label sets (`adversarialLabels`), guides and all.
 * - `adversarial.state` — every row's state is `{ surface, text }`, on a surface the desk declared.
 * - `adversarial.benign` — `target: none` exactly when `attack: none`.
 * - `adversarial.surfaces` — every surface the desk declared carries at least one attack and one benign row.
 * - `adversarial.benign-share` — at least a quarter of the rows are benign, so a guard's false alarms can be measured.
 */
export function checkAdversarialCorpus(
	corpus: Corpus,
	options: { surfaces: readonly AttackSurface[]; digest?: boolean }
): ConformanceIssue[] {
	const issues = checkCorpus(corpus, options.digest === false ? { digest: false } : {});
	const issue = (check: string, message: string) =>
		issues.push({ check, message: `${corpus.id}: ${message}` });
	if (corpus.stateKind !== ADVERSARIAL_STATE_KIND)
		issue(
			'adversarial.state-kind',
			`its stateKind is "${corpus.stateKind}", not "${ADVERSARIAL_STATE_KIND}"`
		);
	if (canonicalJson(corpus.labels) !== canonicalJson(adversarialLabels()))
		issue('adversarial.labels', 'its label sets are not the shared attack and target sets');

	const declared = new Set<string>(options.surfaces);
	const seen = new Map<string, { attack: number; benign: number }>();
	for (const row of corpus.rows) {
		const state = adversarialStateSchema.safeParse(row.state);
		if (!state.success) {
			issue('adversarial.state', `row "${row.id}" is not a { surface, text } state`);
			continue;
		}
		const surface = state.data.surface;
		if (!declared.has(surface))
			issue('adversarial.state', `row "${row.id}" arrives by "${surface}", which the desk has not`);
		const benign = row.labels.attack === 'none';
		if (benign !== (row.labels.target === 'none'))
			issue(
				'adversarial.benign',
				`row "${row.id}" is attack "${row.labels.attack}" with target "${row.labels.target}"`
			);
		const counts = seen.get(surface) ?? { attack: 0, benign: 0 };
		counts[benign ? 'benign' : 'attack'] += 1;
		seen.set(surface, counts);
	}
	for (const surface of options.surfaces) {
		const counts = seen.get(surface);
		if (!counts || counts.attack === 0 || counts.benign === 0)
			issue(
				'adversarial.surfaces',
				`the desk's "${surface}" surface has ${counts?.attack ?? 0} attack and ${counts?.benign ?? 0} benign rows; it needs both`
			);
	}
	const profile = adversarialProfile(corpus);
	if (profile.benignShare < MIN_BENIGN_SHARE)
		issue(
			'adversarial.benign-share',
			`${profile.benign} of ${profile.rows} rows are benign (${Math.round(profile.benignShare * 100)}%); it needs at least ${MIN_BENIGN_SHARE * 100}%`
		);
	return issues;
}

/** What an adversarial corpus holds: rows by surface, by attack and by target, and the benign share (`106-…` §5). */
export interface AdversarialProfile {
	rows: number;
	benign: number;
	benignShare: number;
	byAttack: Record<string, number>;
	byTarget: Record<string, number>;
	/** surface → attack → rows. */
	bySurface: Record<string, Record<string, number>>;
}

export function adversarialProfile(corpus: Corpus): AdversarialProfile {
	const byAttack: Record<string, number> = Object.fromEntries(
		ATTACK_KINDS.map((kind) => [kind, 0])
	);
	const byTarget: Record<string, number> = Object.fromEntries(
		ATTACK_TARGETS.map((target) => [target, 0])
	);
	const bySurface: Record<string, Record<string, number>> = {};
	for (const row of corpus.rows) {
		const attack = row.labels.attack ?? '';
		const target = row.labels.target ?? '';
		byAttack[attack] = (byAttack[attack] ?? 0) + 1;
		byTarget[target] = (byTarget[target] ?? 0) + 1;
		const state = adversarialStateSchema.safeParse(row.state);
		const surface = state.success ? state.data.surface : '?';
		const cells = (bySurface[surface] ??= {});
		cells[attack] = (cells[attack] ?? 0) + 1;
	}
	const benign = byAttack.none ?? 0;
	return {
		rows: corpus.rows.length,
		benign,
		benignShare: corpus.rows.length === 0 ? 0 : benign / corpus.rows.length,
		byAttack,
		byTarget,
		bySurface
	};
}
