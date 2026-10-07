import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	canonicalJson,
	parseProviderRecording,
	sha256Hex,
	type ProviderRecordingFile,
	type RecordedCall,
	type RecordedCell
} from '@craftabot/core';
import { expandExperiment, parseExperiment } from '@craftabot/evals';
import { firstDivergence, itemEstimate, pathDistance, type Estimate } from '@craftabot/metrics';
import type { HarnessConfig } from '../config.js';
import type { CredentialSource } from '../credentials.js';
import { withPopulationSize, withTrials } from './experiment.js';
import { recordExperiment } from './record-provider.js';

/**
 * **`craftabot reperform`** (WP192, `113-RECORDING-AND-RELIABILITY.md` §4.8):
 * a recording's cells performed again, live, with the same inputs, and compared
 * with the original. Replay answers "does today's code reproduce what the model
 * said?"; this answers the other question — "does the model say it again?" It
 * is a measurement, not a check: a live model is not repeatable and nothing here
 * requires it to be. What it reports is how often it was, and how soon and how
 * far the paths forked when it was not.
 *
 * The cells' inputs are rebuilt from the manifest's design: the design file is
 * expanded exactly as it was recorded and each campaign's digest held to the
 * manifest's, so a changed design or population is refused (`--allow-drift` says
 * otherwise, and the report says it was said).
 */
export interface ReperformOptions {
	/** The recording to perform again. */
	recording: string;
	/** The design that was recorded. */
	file: string;
	/** `mock`, or the provider id every cassette brain's cartridge names. */
	provider: string;
	/** How many fresh performances of each chosen cell. */
	trials: number;
	/** Where the new performances, their recording and the comparison go. */
	out: string;
	config: HarnessConfig;
	credentials: CredentialSource;
	size?: number;
	concurrency?: number;
	/** Only the items whose cell key contains this text. */
	cells?: string;
	/** At most this many items, taken evenly across the ones chosen. */
	limit?: number;
	/** Rerun although the design or its inputs are not the recorded ones. */
	allowDrift?: boolean;
	now?: () => string;
	newId?: () => string;
	clock?: () => number;
}

export interface ReperformReport {
	recording: string;
	/** Campaigns whose digest differs from the manifest's: empty unless `--allow-drift` was given. */
	drifted: string[];
	items: number;
	originalTrials: number;
	freshTrials: number;
	/** Of every (original, fresh) pair of performances of an item, how often they ended the same way. */
	outcomeAgreement: Estimate;
	/** At the first tick the prompt was the same, so a difference is the model's own. */
	firstTick: { pairs: number; sameCall: Estimate; sameWords: Estimate };
	divergence: {
		/** The share of items whose paths were the original's in every fresh trial. */
		identicalPaths: Estimate;
		medianFirstDivergence: number | null;
		meanPathDistance: number;
	};
	/** Among the fresh trials alone: how often an item came out the same way twice. */
	withinFresh?: { outcomeAgreement: Estimate };
	/** The items whose fresh trials most often disagreed with the original, worst first. */
	disagreements: Array<{ item: string; agreement: number; original: string; fresh: string[] }>;
	recordingFile: string;
}

/** The cell key without its trial: the item a performance belongs to. */
export const itemOfKey = (cellKey: string): string => cellKey.slice(0, cellKey.lastIndexOf('|'));

/** What a cell decided on, call by call, read from the responses its provider gave. */
export function decidedCalls(calls: readonly RecordedCall[]): string[] {
	return calls
		.filter((call) => call.role === 'agent' && call.response !== undefined)
		.map((call) => {
			const tool = call.response!.toolCall;
			return tool ? `${tool.name} ${canonicalJson(tool.arguments ?? {})}` : 'none';
		});
}

const firstWords = (calls: readonly RecordedCall[]): string =>
	calls.find((call) => call.role === 'agent' && call.response !== undefined)?.response?.text ?? '';

const median = (values: number[]): number | null => {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** The comparison of two recordings of the same items: the original's performances against the fresh ones. */
export function compareRecordings(
	original: ProviderRecordingFile,
	fresh: ProviderRecordingFile,
	items?: ReadonlySet<string>
): Omit<ReperformReport, 'recording' | 'drifted' | 'recordingFile'> {
	const group = (file: ProviderRecordingFile) => {
		const groups = new Map<string, RecordedCell[]>();
		for (const cell of file.cells) {
			const key = itemOfKey(cell.cellKey);
			if (items && !items.has(key)) continue;
			groups.set(key, [...(groups.get(key) ?? []), cell]);
		}
		return groups;
	};
	const a = group(original);
	const b = group(fresh);
	const shared = [...a.keys()].filter((key) => b.has(key)).sort();
	const outcomeAgreement: number[] = [];
	const sameCall: number[] = [];
	const sameWords: number[] = [];
	const identical: number[] = [];
	const forks: number[] = [];
	const distances: number[] = [];
	const withinFresh: number[] = [];
	const worst: ReperformReport['disagreements'] = [];
	let pairs = 0;
	for (const key of shared) {
		const before = a.get(key)!;
		const after = b.get(key)!;
		let agree = 0;
		let call = 0;
		let words = 0;
		let total = 0;
		let allSame = true;
		for (const o of before)
			for (const n of after) {
				total += 1;
				if (o.outcome === n.outcome) agree += 1;
				const op = decidedCalls(o.calls);
				const np = decidedCalls(n.calls);
				if (op[0] === np[0]) call += 1;
				if (firstWords(o.calls) === firstWords(n.calls)) words += 1;
				const fork = firstDivergence(op, np);
				if (fork !== undefined) {
					allSame = false;
					forks.push(fork);
				}
				distances.push(pathDistance(op, np));
			}
		pairs += total;
		outcomeAgreement.push(agree / total);
		sameCall.push(call / total);
		sameWords.push(words / total);
		identical.push(allSame ? 1 : 0);
		if (after.length > 1) {
			let same = 0;
			let n = 0;
			for (let i = 0; i < after.length; i += 1)
				for (let j = i + 1; j < after.length; j += 1) {
					n += 1;
					if (after[i]!.outcome === after[j]!.outcome) same += 1;
				}
			withinFresh.push(same / n);
		}
		if (agree < total)
			worst.push({
				item: key,
				agreement: agree / total,
				original: [...new Set(before.map((cell) => cell.outcome ?? 'unknown'))].join(', '),
				fresh: after.map((cell) => cell.outcome ?? 'unknown')
			});
	}
	worst.sort((x, y) => x.agreement - y.agreement || x.item.localeCompare(y.item));
	return {
		items: shared.length,
		originalTrials: Math.max(0, ...[...a.values()].map((cells) => cells.length)),
		freshTrials: Math.max(0, ...[...b.values()].map((cells) => cells.length)),
		outcomeAgreement: itemEstimate(outcomeAgreement),
		firstTick: { pairs, sameCall: itemEstimate(sameCall), sameWords: itemEstimate(sameWords) },
		divergence: {
			identicalPaths: itemEstimate(identical),
			medianFirstDivergence: median(forks),
			meanPathDistance:
				distances.length === 0 ? 0 : distances.reduce((sum, d) => sum + d, 0) / distances.length
		},
		...(withinFresh.length > 0
			? { withinFresh: { outcomeAgreement: itemEstimate(withinFresh) } }
			: {}),
		disagreements: worst.slice(0, 20)
	};
}

export async function reperform(options: ReperformOptions): Promise<ReperformReport> {
	const original = parseProviderRecording(JSON.parse(await readFile(options.recording, 'utf8')));
	const raw = JSON.parse(await readFile(options.file, 'utf8')) as {
		design: { template: { brains: Array<{ cassette?: string }> } };
	};

	// The design as it was recorded: its campaigns' digests are the manifest's, or the inputs have moved.
	const designed = parseExperiment(raw);
	const sized = options.size !== undefined ? withPopulationSize(designed, options.size) : designed;
	const recordedTrials = original.manifest.trials;
	const { campaigns } = expandExperiment(
		designed.design.trials === undefined && recordedTrials > 1
			? withTrials(sized, recordedTrials)
			: sized
	);
	const drifted = campaigns
		.filter(
			(campaign) =>
				original.manifest.campaignDigests[campaign.id] !==
				sha256Hex(`${JSON.stringify(campaign, null, '\t')}\n`)
		)
		.map((campaign) => campaign.id);
	if (drifted.length > 0 && !options.allowDrift)
		throw new Error(
			`reperform: the design or its inputs are not the ones recorded in ${options.recording} (${drifted.length} of ${campaigns.length} campaigns differ: ${drifted.slice(0, 3).join(', ')}${drifted.length > 3 ? ', …' : ''}); give --allow-drift to rerun anyway`
		);

	// The items to perform again.
	const every = [...new Set(original.cells.map((cell) => itemOfKey(cell.cellKey)))].sort();
	const named =
		options.cells === undefined ? every : every.filter((key) => key.includes(options.cells!));
	const chosen =
		options.limit !== undefined && options.limit < named.length
			? Array.from(
					{ length: options.limit },
					(_, i) => named[Math.floor((i * named.length) / options.limit!)]!
				)
			: named;
	if (chosen.length === 0) throw new Error('reperform: no recorded item matches --cells');
	const items = new Set(chosen);

	// The fresh performances are recorded beside, never into, the original: a copy of the design whose cassette paths are new.
	await mkdir(options.out, { recursive: true });
	const recordingFile = join(options.out, 'reperform.recording.json');
	for (const brain of raw.design.template.brains)
		if (brain.cassette !== undefined) brain.cassette = recordingFile;
	const designFile = join(options.out, 'design.json');
	await writeFile(designFile, JSON.stringify(raw), 'utf8');
	await recordExperiment({
		file: designFile,
		provider: options.provider,
		out: join(options.out, 'live'),
		config: options.config,
		credentials: options.credentials,
		...(options.size !== undefined ? { size: options.size } : {}),
		trials: options.trials,
		...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
		include: (_spec, key) => items.has(itemOfKey(key)),
		...(options.now ? { now: options.now } : {}),
		...(options.newId ? { newId: options.newId } : {}),
		...(options.clock ? { clock: options.clock } : {})
	});
	const fresh = parseProviderRecording(JSON.parse(await readFile(recordingFile, 'utf8')));
	const compared = compareRecordings(original, fresh, items);
	const report: ReperformReport = {
		recording: options.recording,
		drifted,
		...compared,
		recordingFile
	};
	await writeFile(
		join(options.out, 'reperform.json'),
		`${JSON.stringify(report, null, '\t')}\n`,
		'utf8'
	);
	return report;
}

export function renderReperform(report: ReperformReport): string {
	const pc = (value: number) => `${(value * 100).toFixed(0)}%`;
	const est = (e: Estimate) => `${pc(e.value)} (${pc(e.interval[0])}–${pc(e.interval[1])})`;
	const lines = [
		`reperform of ${report.recording}: ${report.items} items, ${report.originalTrials} original and ${report.freshTrials} fresh trial(s) each${report.drifted.length > 0 ? ` — RERUN OVER A MOVED DESIGN (${report.drifted.length} campaigns differ)` : ''}`,
		`  outcome         the same as the original in ${est(report.outcomeAgreement)} of performances`,
		`  first tick      the same call in ${est(report.firstTick.sameCall)} of ${report.firstTick.pairs} pairs, the same words in ${est(report.firstTick.sameWords)}`,
		`  path            the original's path in every fresh trial for ${est(report.divergence.identicalPaths)} of items; where it forked, first at call ${report.divergence.medianFirstDivergence ?? '—'} (median), ${report.divergence.meanPathDistance.toFixed(1)} edits apart on average`
	];
	if (report.withinFresh)
		lines.push(
			`  among the fresh  the same outcome twice in ${est(report.withinFresh.outcomeAgreement)} of pairs`
		);
	if (report.disagreements.length > 0) {
		lines.push('  most disagreeing items:');
		for (const d of report.disagreements.slice(0, 5))
			lines.push(
				`    ${pc(d.agreement)}  ${d.item}  was ${d.original}, now ${d.fresh.join(' / ')}`
			);
	}
	return `${lines.join('\n')}\n`;
}
