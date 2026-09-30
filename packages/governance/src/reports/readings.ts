import {
	REVIEW_SUBJECT_KINDS,
	latestReviews,
	reviewSubjectKey,
	type CalibrationTable,
	type ControlMap,
	type DomainSpec,
	type ErrorModel,
	type GuardrailCatalogue,
	type PackManifest,
	type Review,
	type ReviewerModel,
	type ReviewSubject,
	type ReviewSubjectKind
} from '@craftabot/core';

/**
 * **The reading desk's fold** (WP129, `108-READINGS.md` §3, §6; `100-…`
 * §6.8, D21): every subject a pack ships pending across the eight kinds,
 * each with its source beside it, and the reading each has had. Pure data in,
 * data out: the Workshop's `/workshop/readings` and `craftabot readings
 * export` are two hosts of the same fold, and the checks (`checkCalibration`,
 * `checkCatalogue`, `checkControlMap`, `checkDomainPack`) honour the same
 * records through `isReviewed`.
 */

/** A screening list as the host hands it over: the lists are a pack's constant, not a manifest field (`108-…` §3). */
export interface ReadingScreeningList {
	/** `<pack>/screening#<list>`. */
	id: string;
	title: string;
	entries: readonly string[];
}

/** A blueprint note as the host reads it: its id (`healthcare`) and its markdown. */
export interface ReadingBlueprintNote {
	id: string;
	title: string;
	markdown: string;
}

/** Everything the fold reads subjects from; each part optional, so a host passes what it has. */
export interface ReadingSources {
	catalogue?: GuardrailCatalogue;
	calibrations?: readonly CalibrationTable[];
	controlMaps?: readonly ControlMap[];
	domains?: readonly DomainSpec[];
	blueprints?: readonly ReadingBlueprintNote[];
	screeningLists?: readonly ReadingScreeningList[];
	errorModels?: readonly ErrorModel[];
	reviewerModels?: readonly ReviewerModel[];
}

/** One line of what the reader reads the subject against. */
export interface ReadingSourceLine {
	label: string;
	value: string;
	url?: string;
}

/** A subject its content still ships pending, with its source. */
export interface ReadingSubject {
	subject: ReviewSubject;
	title: string;
	/** What it belongs to: the table, the map, the domain, the note, the pack. */
	group: string;
	source: ReadingSourceLine[];
}

/** `unread`: no review; `accepted`/`amended`: reviewed; `rejected`: read and refused, still pending. */
export type ReadingState = 'unread' | 'accepted' | 'amended' | 'rejected';

/** A subject with the latest reading naming it, and the state that reading leaves it in. */
export interface ReadingItem extends ReadingSubject {
	state: ReadingState;
	review?: Review;
}

/** One kind's readout: how many there are, how many are read, and how many are still open. */
export interface ReadingProgress {
	kind: ReviewSubjectKind;
	total: number;
	/** Accepted or amended. */
	read: number;
	amended: number;
	rejected: number;
	/** Unread or rejected: the pending set the checks raise. */
	open: number;
}

/** The kind's words, for a heading and a readout. */
export const READING_KIND_LABELS: Record<ReviewSubjectKind, string> = {
	'catalogue-entry': 'Catalogue entries',
	'calibration-row': 'Calibration rows',
	'control-row': 'Control rows',
	'decision-right': 'Decision rights',
	'blueprint-item': 'Blueprint items',
	'screening-list': 'Screening lists',
	'error-model': 'Error models',
	'reviewer-model': 'Reviewer models'
};

/** One checklist box of a blueprint note (`docs/blueprints/*.md` §6). */
export interface BlueprintItem {
	/** The item's number, or `tests` for the unnumbered box after them. */
	id: string;
	text: string;
	checked: boolean;
}

/**
 * The boxes of a blueprint note: every `- [ ]` or `- [x]` line. A numbered box
 * (`- [ ] 4 — …`) is its number; the unnumbered one is `tests` (a second,
 * `tests-2`, and so on).
 */
export function blueprintItems(markdown: string): BlueprintItem[] {
	const items: BlueprintItem[] = [];
	let unnumbered = 0;
	for (const line of markdown.split(/\r?\n/)) {
		const box = /^- \[( |x|X)\] (.*)$/.exec(line);
		if (!box) continue;
		const numbered = /^(\d+) — (.*)$/.exec(box[2]!);
		const id = numbered ? numbered[1]! : ++unnumbered === 1 ? 'tests' : `tests-${unnumbered}`;
		items.push({ id, text: box[2]!, checked: box[1] !== ' ' });
	}
	return items;
}

function refLine(
	label: string,
	ref: { table: string; row: string; key: string }
): ReadingSourceLine {
	return { label, value: `${ref.table}#${ref.row} → ${ref.key}` };
}

/** Every subject the sources ship pending, in the kinds' order (`108-…` §3). */
export function readingSubjects(sources: ReadingSources): ReadingSubject[] {
	const subjects: ReadingSubject[] = [];
	const catalogue = sources.catalogue;
	for (const entry of catalogue?.entries ?? []) {
		if (entry.review !== 'pending') continue;
		subjects.push({
			subject: { kind: 'catalogue-entry', id: entry.id },
			title: entry.name,
			group: `The Guardrail Catalogue, ${catalogue!.edition}`,
			source: [
				{ label: 'Summary', value: entry.summary },
				{ label: 'Coverage', value: `${entry.coverage.status} — ${entry.coverage.note}` },
				...entry.sources.map((source) => ({
					label: 'Cites',
					value: `${source.publisher}, ${source.title} (${source.year})`,
					...(source.url ? { url: source.url } : {})
				}))
			]
		});
	}
	for (const table of sources.calibrations ?? []) {
		for (const row of table.rows) {
			if (row.review !== 'pending') continue;
			const cite =
				row.source.kind === 'publication'
					? {
							label: 'Cites',
							value: `${row.source.publisher}, ${row.source.title}, ${row.source.edition}, ${row.source.table} (read ${row.source.retrieved})`,
							...(row.source.url ? { url: row.source.url } : {})
						}
					: { label: 'Assumption', value: `stated ${row.source.retrieved}` };
			subjects.push({
				subject: { kind: 'calibration-row', id: `${table.id}#${row.id}` },
				title: row.title,
				group: table.title,
				source: [
					{
						label: row.kind === 'rates' ? 'Rates' : row.kind === 'target' ? 'Target' : 'Weights',
						value: Object.entries(row.distribution)
							.map(([key, value]) => `${key} ${value}`)
							.join(' · ')
					},
					cite,
					...(row.note ? [{ label: 'Note', value: row.note }] : []),
					{ label: 'Tolerance', value: String(row.tolerance) }
				]
			});
		}
	}
	for (const map of sources.controlMaps ?? []) {
		for (const row of map.rows) {
			if (row.status === undefined) continue;
			subjects.push({
				subject: { kind: 'control-row', id: `${map.id}#${row.ref}` },
				title: `${row.ref} — ${row.title}`,
				group: map.title,
				source: [
					{ label: 'Framework', value: row.framework },
					{ label: 'Obligation', value: row.obligation },
					{
						label: 'Evidence',
						value:
							row.evidence.length === 0
								? 'none named'
								: row.evidence.map((item) => `${item.kind} ${item.id}`).join('; ')
					},
					{ label: 'Status', value: row.status },
					...(row.note ? [{ label: 'Note', value: row.note }] : [])
				]
			});
		}
	}
	for (const domain of sources.domains ?? []) {
		for (const right of domain.decisionRights) {
			subjects.push({
				subject: { kind: 'decision-right', id: `${domain.id}#${right.kind}` },
				title: right.kind,
				group: domain.name,
				source: [
					{ label: 'Ceiling', value: `Level ${right.ceiling}` },
					{ label: 'Why', value: right.why },
					{
						label: 'Source',
						value: `${right.source.title}${right.source.retrieved ? ` (read ${right.source.retrieved})` : ''}`,
						...(right.source.url ? { url: right.source.url } : {})
					}
				]
			});
		}
	}
	for (const note of sources.blueprints ?? []) {
		for (const item of blueprintItems(note.markdown)) {
			if (item.checked) continue;
			subjects.push({
				subject: { kind: 'blueprint-item', id: `${note.id}#${item.id}` },
				title: item.id === 'tests' ? 'The tests' : `Item ${item.id}`,
				group: note.title,
				source: [{ label: 'The box', value: item.text }]
			});
		}
	}
	for (const list of sources.screeningLists ?? []) {
		subjects.push({
			subject: { kind: 'screening-list', id: list.id },
			title: list.title,
			group: list.id.slice(0, list.id.indexOf('#') < 0 ? undefined : list.id.indexOf('#')),
			source: list.entries.map((entry) => ({ label: 'Entry', value: entry }))
		});
	}
	for (const model of sources.errorModels ?? []) {
		subjects.push({
			subject: { kind: 'error-model', id: model.id },
			title: model.name,
			group: model.id.split('/')[0]!,
			source: [
				{ label: 'Description', value: model.description },
				...model.faults.flatMap((fault) => [
					{
						label: 'Corrupts',
						value: `${fault.field ? `${fault.action ?? 'any'}.${fault.field}` : 'the action'} among ${fault.options.join(', ')}, ${
							fault.direction === 'uniform' ? 'uniformly' : `toward ${fault.direction.toward}`
						}`
					},
					refLine('At the rate', fault.rate)
				])
			]
		});
	}
	for (const model of sources.reviewerModels ?? []) {
		subjects.push({
			subject: { kind: 'reviewer-model', id: model.id },
			title: model.name,
			group: model.id.split('/')[0]!,
			source: [
				{ label: 'Description', value: model.description },
				refLine('Accuracy', model.accuracy),
				refLine('Automation bias', model.automationBias),
				refLine('Seconds per case', model.secondsPerCase)
			]
		});
	}
	const order = new Map(REVIEW_SUBJECT_KINDS.map((kind, index) => [kind, index]));
	return subjects
		.map((subject, index) => ({ subject, index }))
		.sort(
			(a, b) =>
				order.get(a.subject.subject.kind)! - order.get(b.subject.subject.kind)! || a.index - b.index
		)
		.map(({ subject }) => subject);
}

/**
 * The sources from what a host installs: the calibration tables, control
 * maps, domains, error and reviewer models the manifests carry (each id once,
 * the first manifest's), with the catalogue, the blueprint notes and the
 * screening lists the host hands over itself.
 */
export function readingSourcesFrom(
	manifests: readonly PackManifest[],
	extras: Pick<ReadingSources, 'catalogue' | 'blueprints' | 'screeningLists'> = {}
): ReadingSources {
	const once = <T extends { id: string }>(items: T[]): T[] => {
		const seen = new Set<string>();
		return items.filter((item) => {
			if (seen.has(item.id)) return false;
			seen.add(item.id);
			return true;
		});
	};
	return {
		...extras,
		calibrations: once(manifests.flatMap((manifest) => manifest.calibrations ?? [])),
		controlMaps: once(manifests.flatMap((manifest) => manifest.controlMaps ?? [])),
		domains: once(manifests.flatMap((manifest) => manifest.domains ?? [])),
		errorModels: once(manifests.flatMap((manifest) => manifest.errorModels ?? [])),
		reviewerModels: once(manifests.flatMap((manifest) => manifest.reviewerModels ?? []))
	};
}

/** Each subject with the latest reading naming it (`108-…` §2). */
export function readingQueue(
	subjects: readonly ReadingSubject[],
	reviews: readonly Review[]
): ReadingItem[] {
	const latest = latestReviews(reviews);
	return subjects.map((subject) => {
		const review = latest.get(reviewSubjectKey(subject.subject));
		return review ? { ...subject, state: review.verdict, review } : { ...subject, state: 'unread' };
	});
}

/** A readout per kind, in the kinds' order — every kind, even one with nothing to read. */
export function readingProgress(queue: readonly ReadingItem[]): ReadingProgress[] {
	return REVIEW_SUBJECT_KINDS.map((kind) => {
		const items = queue.filter((item) => item.subject.kind === kind);
		const count = (state: ReadingState) => items.filter((item) => item.state === state).length;
		return {
			kind,
			total: items.length,
			read: count('accepted') + count('amended'),
			amended: count('amended'),
			rejected: count('rejected'),
			open: count('unread') + count('rejected')
		};
	});
}

/** The export's file (`craftabot readings export`): the queue with its readings, and the readouts. */
export interface ReadingsExport {
	kind: 'craftabot-readings';
	version: 1;
	generatedAt: string;
	progress: ReadingProgress[];
	items: ReadingItem[];
}

/** The export file over a queue, with its readouts. */
export function readingsExport(queue: readonly ReadingItem[], generatedAt: string): ReadingsExport {
	return {
		kind: 'craftabot-readings',
		version: 1,
		generatedAt,
		progress: readingProgress(queue),
		items: [...queue]
	};
}

/** The same, as markdown: a maintainer's work list — the amendments first, then what is open. */
export function renderReadingsMarkdown(file: ReadingsExport): string {
	const lines: string[] = [
		'# Readings',
		'',
		`Generated ${file.generatedAt}.`,
		'',
		'| Kind | Read | Of | Amended | Rejected | Open |',
		'|---|---|---|---|---|---|'
	];
	for (const row of file.progress)
		lines.push(
			`| ${READING_KIND_LABELS[row.kind]} | ${row.read} | ${row.total} | ${row.amended} | ${row.rejected} | ${row.open} |`
		);
	const amended = file.items.filter((item) => item.state === 'amended');
	lines.push('', '## Amendments to edit in', '');
	if (amended.length === 0) lines.push('None.');
	for (const item of amended) {
		const review = item.review!;
		lines.push(
			`- \`${item.subject.kind}\` \`${item.subject.id}\`: set \`${review.amendment!.field}\` to \`${JSON.stringify(review.amendment!.value)}\` — ${review.by.name ?? review.by.id}, ${review.on.slice(0, 10)}${review.note ? `. ${review.note}` : ''}`
		);
	}
	const rejected = file.items.filter((item) => item.state === 'rejected');
	lines.push('', '## Rejected', '');
	if (rejected.length === 0) lines.push('None.');
	for (const item of rejected)
		lines.push(
			`- \`${item.subject.kind}\` \`${item.subject.id}\`: ${item.review!.note ?? ''} — ${item.review!.by.name ?? item.review!.by.id}, ${item.review!.on.slice(0, 10)}`
		);
	const unread = file.items.filter((item) => item.state === 'unread');
	lines.push('', `## Unread (${unread.length})`, '');
	for (const kind of REVIEW_SUBJECT_KINDS) {
		const ofKind = unread.filter((item) => item.subject.kind === kind);
		if (ofKind.length === 0) continue;
		lines.push(`### ${READING_KIND_LABELS[kind]}`, '');
		for (const item of ofKind) lines.push(`- \`${item.subject.id}\` — ${item.title}`);
		lines.push('');
	}
	return `${lines.join('\n').trimEnd()}\n`;
}
