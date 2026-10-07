import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
	cellKeyOf,
	type EngineEvent,
	parseProviderRecording,
	pathDigestOf,
	type ProviderRecordingFile,
	type Storage
} from '@craftabot/core';
import { createFileStorage } from '../storage/file-storage.js';
import type { CampaignReport } from '@craftabot/evals';
import type { HarnessConfig } from '../config.js';
import type { CredentialSource } from '../credentials.js';
import { experimentRun } from './experiment.js';

/**
 * **`craftabot recording verify`** (WP190, `113-RECORDING-AND-RELIABILITY.md`
 * §4.5): a recording held to what it says. The design is replayed from the
 * recording alone, under `--egress none`, and every cell must answer every
 * call it recorded, from the prompts it recorded, and finish on the path
 * digest the live run did. With `--live-store`, the recording is also held
 * against the live run's own store: each journey's runs, read back from it,
 * must digest to what the recording says they did.
 */
export interface RecordingVerifyOptions {
	/** The recording file (a design's `cassette` path). */
	recording: string;
	/** The design that was recorded. */
	file: string;
	/** Where the replay's runs go. */
	out: string;
	config: HarnessConfig;
	configPath?: string;
	credentials: CredentialSource;
	size?: number;
	/** How many times each cell was performed, when the design file does not say (WP191). */
	trials?: number;
	/** The live recording's output directory (`recordings/<id>/trial-<n>`), holding `<campaign>/runs/`. */
	liveStore?: string;
	now?: () => string;
	newId?: () => string;
}

export interface RecordingVerifyReport {
	recording: string;
	recordedCells: number;
	replayedCells: number;
	match: number;
	mismatch: string[];
	diverged: string[];
	unrecorded: string[];
	/** Recorded cells the replay never ran, and replayed cells the recording does not hold. */
	missing: string[];
	extra: string[];
	/** Recorded calls the replay never asked for, summed over cells. */
	unusedCalls: number;
	/** Cells whose live store does not digest to the recording (with `--live-store`). */
	liveMismatch: string[];
	liveChecked: number;
	ok: boolean;
}

export async function recordingVerify(
	options: RecordingVerifyOptions
): Promise<RecordingVerifyReport> {
	const recording: ProviderRecordingFile = parseProviderRecording(
		JSON.parse(await readFile(options.recording, 'utf8'))
	);
	// Each cell's ordinal — so its ids and its draws — depends on how many trials the design asked for: the one the recording
	// was made with, unless the design file or --trials says.
	const designed = JSON.parse(await readFile(options.file, 'utf8')) as {
		design?: { trials?: number };
	};
	const trials =
		options.trials ??
		(designed.design?.trials === undefined && recording.manifest.trials > 1
			? recording.manifest.trials
			: undefined);
	const replayed = await experimentRun({
		file: options.file,
		out: options.out,
		config: options.config,
		...(options.configPath !== undefined ? { configPath: options.configPath } : {}),
		credentials: options.credentials,
		...(options.size !== undefined ? { size: options.size } : {}),
		...(trials !== undefined ? { trials } : {}),
		egress: 'none',
		...(options.now ? { now: options.now } : {}),
		...(options.newId ? { newId: options.newId } : {})
	});

	const report: RecordingVerifyReport = {
		recording: options.recording,
		recordedCells: recording.cells.length,
		replayedCells: 0,
		match: 0,
		mismatch: [],
		diverged: [],
		unrecorded: [],
		missing: [],
		extra: [],
		unusedCalls: 0,
		liveMismatch: [],
		liveChecked: 0,
		ok: false
	};
	const recorded = new Map(recording.cells.map((cell) => [cell.cellKey, cell]));
	const seen = new Set<string>();
	for (const path of replayed.reportFiles) {
		const campaign = JSON.parse(await readFile(path, 'utf8')) as CampaignReport;
		for (const cell of campaign.cells) {
			const key = cellKeyOf({
				campaignId: campaign.campaignId,
				scenario: cell.scenario,
				build: cell.build,
				guard: cell.guard,
				brain: cell.brain,
				context: cell.context,
				item: cell.item?.id,
				seed: cell.seed,
				trial: cell.trial
			});
			// A cell that never called the provider has no tape: it is neither recorded nor missed.
			if (!recorded.has(key)) {
				if (cell.replay || cell.error?.startsWith('replay-diverged')) report.extra.push(key);
				continue;
			}
			seen.add(key);
			report.replayedCells += 1;
			if (cell.error?.startsWith('replay-diverged') || cell.replay?.status === 'diverged') {
				report.diverged.push(key);
			} else if (cell.replay === undefined) report.unrecorded.push(key);
			else if (cell.replay.status === 'match') report.match += 1;
			else if (cell.replay.status === 'unrecorded') report.unrecorded.push(key);
			else report.mismatch.push(key);
			report.unusedCalls += cell.replay?.unused ?? 0;
		}
	}
	for (const key of recorded.keys()) if (!seen.has(key)) report.missing.push(key);

	if (options.liveStore) await checkLiveStore(options.liveStore, recording, report);

	report.ok =
		report.mismatch.length === 0 &&
		report.diverged.length === 0 &&
		report.unrecorded.length === 0 &&
		report.missing.length === 0 &&
		report.extra.length === 0 &&
		report.unusedCalls === 0 &&
		report.liveMismatch.length === 0;
	return report;
}

/**
 * Each recorded cell's runs, read back from the live run's own store, digested the way the recorder did. A store is
 * per campaign (`<live-store>/<campaign>/runs`) and run ids repeat across campaigns, so a cell is read from its own.
 */
async function checkLiveStore(
	liveStore: string,
	recording: ProviderRecordingFile,
	report: RecordingVerifyReport
): Promise<void> {
	const stores = new Map<string, Storage | undefined>();
	// `--live-store` is a record out directory (`<campaign>/runs`), or the directory holding one per trial (`trial-<n>/<campaign>/runs`).
	const storeOf = async (campaignId: string, trial: number): Promise<Storage | undefined> => {
		const key = `${trial}|${campaignId}`;
		if (!stores.has(key)) {
			const dir = [
				join(liveStore, `trial-${trial}`, campaignId, 'runs'),
				join(liveStore, campaignId, 'runs')
			].find((candidate) => existsSync(candidate));
			stores.set(key, dir === undefined ? undefined : await createFileStorage(dir));
		}
		return stores.get(key);
	};
	for (const cell of recording.cells) {
		if (cell.pathDigest === undefined) continue;
		const ids = cell.runIds ?? (cell.runId !== undefined ? [cell.runId] : []);
		if (ids.length === 0) continue;
		report.liveChecked += 1;
		const store = await storeOf(cell.cellKey.split('|')[0]!, cell.trial);
		let matches = false;
		if (store) {
			const runs: EngineEvent[][] = [];
			for (const id of ids) runs.push((await store.getEvents(id)).map((row) => row.event));
			const held =
				cell.workflowRunId !== undefined
					? await store.getWorkflowRun(cell.workflowRunId)
					: undefined;
			const complete =
				runs.every((events) => events.length > 0) &&
				(cell.workflowRunId === undefined || held !== undefined);
			matches =
				complete &&
				pathDigestOf(
					runs,
					held ? { events: held.run.events, stages: held.run.stages } : undefined
				) === cell.pathDigest;
		}
		if (!matches) report.liveMismatch.push(cell.cellKey);
	}
}

export function renderRecordingVerify(report: RecordingVerifyReport): string {
	const lines = [
		`recording ${report.recording}: ${report.ok ? 'verified' : 'NOT verified'}`,
		`  cells      ${report.recordedCells} recorded, ${report.replayedCells} replayed, ${report.match} on the recorded path`
	];
	const list = (label: string, keys: string[]) => {
		if (keys.length === 0) return;
		lines.push(`  ${label.padEnd(10)} ${keys.length}`);
		for (const key of keys.slice(0, 5)) lines.push(`    ${key}`);
		if (keys.length > 5) lines.push(`    … and ${keys.length - 5} more`);
	};
	list('diverged', report.diverged);
	list('mismatch', report.mismatch);
	list('unrecorded', report.unrecorded);
	list('missing', report.missing);
	list('extra', report.extra);
	if (report.unusedCalls > 0)
		lines.push(`  unused     ${report.unusedCalls} recorded calls the replay never asked for`);
	if (report.liveChecked > 0)
		lines.push(
			`  live store ${report.liveChecked} cells checked, ${report.liveMismatch.length} do not digest to the recording`
		);
	list('live', report.liveMismatch);
	return `${lines.join('\n')}\n`;
}
