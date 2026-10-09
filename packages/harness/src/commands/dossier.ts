import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CalibrationTable, DecisionDossier, ExperimentResult } from '@craftabot/core';
import {
	DEFAULT_DOSSIER_THRESHOLDS,
	decisionDossier,
	renderDossierMarkdown,
	type DossierThresholds
} from '@craftabot/governance/reports';
import { liveRecordings } from './controls.js';

/**
 * **`craftabot dossier`** (plan 114 WP214, `114-DECISIONS-UNDER-PRESSURE-PLAN.md` §6): a decision dossier for every live design in the
 * committed evidence, folded from the results alone — the design's own result, the attack-scenario result under the same model for
 * robustness, and (where one exists) the design with a person at the decisions for oversight. Each is written as JSON and as a page a
 * reader opens with no app, under `docs/evidence/dossiers/`. Nothing here runs a model.
 */
const DECISION_KIND: Record<string, string> = {
	lending: 'the lending decision (approve, decline, refer)',
	disputes: 'the disputes decision (reimburse, decline, refer)',
	collections: 'the forbearance plan offered',
	onboarding: 'the account-opening decision (approve, decline, refer)',
	complaints: 'the complaint root cause named',
	fraud: 'the fraud alert decision (release, hold, block, freeze, escalate)',
	advice: 'the product recommended',
	servicing: 'the servicing request handled'
};

/** The desk a live design belongs to: `lending-stack-live` and `lending-grey-live` are the lending desk's. */
export function deskOf(experimentId: string): string {
	return experimentId.replace(
		/-(stack|context|grey|oversight|escalate|contract)?-?live(-seat)?$/,
		''
	);
}

/** The thresholds a calibration table holds, one row a measure; the defaults for any it does not name. */
export function thresholdsFromTable(table: CalibrationTable | undefined): DossierThresholds {
	const out: DossierThresholds = { ...DEFAULT_DOSSIER_THRESHOLDS };
	for (const row of table?.rows ?? []) {
		const value = row.distribution['value'];
		if (value !== undefined && row.id in out)
			(out as unknown as Record<string, number>)[row.id] = value;
	}
	return out;
}

export interface DossierRun {
	dossier: DecisionDossier;
	/** Which committed result folder it came from: the design's id. */
	designId: string;
}

export async function dossiersFor(options: {
	evidenceDir: string;
	/** The folding time; absent, the newest result's own `ranAt`, so the same evidence folds to the same files. */
	generatedAt?: string;
	thresholds?: DossierThresholds;
}): Promise<DossierRun[]> {
	const live = await liveRecordings(options.evidenceDir);
	const modelOf = new Map(live.runs.map((run) => [run.resultId, run]));
	const entries = live.results.flatMap((result) => {
		const run = modelOf.get(result.id);
		return run ? [{ result, model: run.model, recordedOn: run.recordedOn }] : [];
	});
	const robustness = new Map<string, ExperimentResult>();
	const oversight = new Map<string, ExperimentResult>();
	for (const { result, model } of entries) {
		if (result.experimentId === 'controls-live') robustness.set(model, result);
		if (result.experimentId.endsWith('-oversight-live'))
			oversight.set(`${model}|${deskOf(result.experimentId)}`, result);
	}
	const generatedAt =
		options.generatedAt ??
		entries
			.map(({ result }) => result.ranAt)
			.sort()
			.at(-1) ??
		new Date().toISOString();
	const runs: DossierRun[] = [];
	for (const { result, model, recordedOn } of entries) {
		const id = result.experimentId;
		if (id === 'controls-live' || id.endsWith('-oversight-live') || id.endsWith('-seat')) continue;
		const desk = deskOf(id);
		const robust = robustness.get(model);
		const person = oversight.get(`${model}|${desk}`);
		runs.push({
			designId: id,
			dossier: decisionDossier({
				subject: id,
				decisionKind: DECISION_KIND[desk] ?? desk,
				model,
				...(recordedOn ? { recordedOn } : {}),
				result,
				...(robust ? { robustness: robust } : {}),
				...(person ? { oversight: person } : {}),
				...(options.thresholds ? { thresholds: options.thresholds } : {}),
				generatedAt
			})
		});
	}
	return runs.sort((a, b) => a.dossier.id.localeCompare(b.dossier.id));
}

/** The short name of a model's suite for a file name: `122B`, `35B`. */
const modelTag = (model: string): string =>
	model.includes('122B') ? '122b' : model.includes('35B') ? '35b' : 'model';

/** What `writeDossiers` would write, as path → text, so a check can compare it with the files on disk. */
export function dossierFiles(runs: readonly DossierRun[], dir: string): Map<string, string> {
	const files = new Map<string, string>();
	for (const { dossier, designId } of runs) {
		const base = join(dir, `${designId}.${modelTag(dossier.model)}.dossier`);
		files.set(`${base}.json`, `${JSON.stringify(dossier, null, '\t')}\n`);
		files.set(`${base}.md`, renderDossierMarkdown(dossier));
	}
	files.set(join(dir, 'README.md'), dossierIndex(runs));
	return files;
}

/** Write each dossier as `<design>.<model>.dossier.json` and `.md`, and an index; returns the paths written. */
export async function writeDossiers(runs: readonly DossierRun[], dir: string): Promise<string[]> {
	await mkdir(dir, { recursive: true });
	const files = dossierFiles(runs, dir);
	for (const [path, text] of files) await writeFile(path, text, 'utf8');
	return [...files.keys()];
}

/** The index page: one row a dossier. */
function dossierIndex(runs: readonly DossierRun[]): string {
	const lines = [
		'# Decision dossiers',
		'',
		'Written by `craftabot dossier` from the committed live results (plan 114 WP214); do not edit by hand. One claim per design and model: eight measures against thresholds a bank would set, `fs-bank/dossier-thresholds` (assumptions, pending review). A dossier reads **not shown** wherever the evidence sits at a ceiling at a small *n* or does not exist, and that is the expected first reading.',
		'',
		'| Design | Model | Claim | Met | Not met | Not shown |',
		'|---|---|---|---:|---:|---:|',
		...runs.map(({ dossier, designId }) => {
			const count = (verdict: string) =>
				dossier.measures.filter((measure) => measure.verdict === verdict).length;
			return `| [${designId}](${designId}.${modelTag(dossier.model)}.dossier.md) | ${modelTag(dossier.model)} | **${dossier.verdict}** | ${count('met')} | ${count('not-met')} | ${count('not-shown')} |`;
		}),
		''
	];
	return lines.join('\n');
}

export const dossiersExist = (dir: string): boolean => existsSync(join(dir, 'README.md'));
