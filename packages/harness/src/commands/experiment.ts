import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	parseExperimentResult,
	type EgressMode,
	type ExperimentResult,
	type Principal
} from '@craftabot/core';
import {
	analyseExperiment,
	expandExperiment,
	parseCampaignReport,
	parseExperiment,
	renderExperimentMarkdown,
	type CampaignReport,
	type Experiment
} from '@craftabot/evals';
import type { HarnessConfig } from '../config.js';
import type { CredentialSource } from '../credentials.js';
import { runCampaignFile } from './campaign.js';

/**
 * **`craftabot experiment run | analyse | render`** (WP89, `72-EXPERIMENTS.md`
 * §4; `64-…` §6.8.1): `run` expands the design to its campaigns — one file
 * per level combination, sharing seeds, written beside the reports so what
 * ran is what CI could run — runs each as `campaign` runs one, then folds
 * the reports into effects and a verdict; `analyse` re-folds the reports
 * already in `--out`; `render` prints a result as markdown. The result is
 * `<out>/<experiment-id>.experiment-result.json` with its digest, and `.md`.
 */
export interface ExperimentRunOptions {
	file: string;
	out: string;
	jobs?: number;
	config: HarnessConfig;
	credentials: CredentialSource;
	now?: () => string;
	newId?: () => string;
	egress?: EgressMode;
	principal?: Principal;
	/** WP90: the population's size for a shape run, over the design's own. */
	size?: number;
}

export interface ExperimentRunReport {
	experiment: Experiment;
	campaignFiles: string[];
	reportFiles: string[];
	result: ExperimentResult;
	resultFile: string;
	markdownFile: string;
	cells: number;
}

const resultPath = (out: string, experimentId: string) =>
	join(out, `${experimentId}.experiment-result.json`);
const reportPath = (out: string, campaignId: string) => join(out, `${campaignId}.report.json`);

/** The design with its book population at another size — a shape run; a design with the book inline cannot be resized and says so. */
export function withPopulationSize(experiment: Experiment, size: number): Experiment {
	const source = experiment.design.template.source;
	if (!source)
		throw new Error('--size wants a design over a book population; this one runs scenarios');
	if (!source.population)
		throw new Error(
			'--size wants a design over a book population; this one carries its book inline'
		);
	return {
		...experiment,
		design: {
			...experiment.design,
			template: {
				...experiment.design.template,
				source: { ...source, population: { ...source.population, size } }
			}
		}
	};
}

async function readExperiment(file: string): Promise<Experiment> {
	return parseExperiment(JSON.parse(await readFile(file, 'utf8')));
}

async function writeResult(
	out: string,
	result: ExperimentResult
): Promise<{ resultFile: string; markdownFile: string }> {
	const resultFile = resultPath(out, result.experimentId);
	const markdownFile = join(out, `${result.experimentId}.experiment-result.md`);
	await writeFile(resultFile, `${JSON.stringify(result, null, '\t')}\n`, 'utf8');
	await writeFile(markdownFile, renderExperimentMarkdown(result), 'utf8');
	return { resultFile, markdownFile };
}

export async function experimentRun(options: ExperimentRunOptions): Promise<ExperimentRunReport> {
	const designed = await readExperiment(options.file);
	const { experiment, campaigns } = expandExperiment(
		options.size !== undefined ? withPopulationSize(designed, options.size) : designed
	);
	await mkdir(options.out, { recursive: true });
	// The filled design beside the campaigns: the campaign ids are part of what ran.
	await writeFile(
		join(options.out, `${experiment.id}.experiment.json`),
		`${JSON.stringify(experiment, null, '\t')}\n`,
		'utf8'
	);
	const campaignFiles: string[] = [];
	const reportFiles: string[] = [];
	const reports: CampaignReport[] = [];
	let cells = 0;
	for (const campaign of campaigns) {
		const campaignFile = join(options.out, `${campaign.id}.campaign.json`);
		await writeFile(campaignFile, `${JSON.stringify(campaign, null, '\t')}\n`, 'utf8');
		campaignFiles.push(campaignFile);
		const ran = await runCampaignFile({
			file: campaignFile,
			out: options.out,
			config: options.config,
			credentials: options.credentials,
			...(options.jobs !== undefined ? { jobs: options.jobs } : {}),
			...(options.now ? { now: options.now } : {}),
			...(options.newId ? { newId: options.newId } : {}),
			...(options.egress !== undefined ? { egress: options.egress } : {}),
			...(options.principal ? { principal: options.principal } : {})
		});
		// The report under the campaign's id, so `analyse` finds it again.
		const file = reportPath(options.out, campaign.id);
		await writeFile(file, `${JSON.stringify(ran.report, null, '\t')}\n`, 'utf8');
		reportFiles.push(file);
		reports.push(ran.report);
		cells += ran.report.cells.length;
	}
	const ranAt = (options.now ?? (() => new Date().toISOString()))();
	const result = analyseExperiment(experiment, reports, { ranAt });
	const written = await writeResult(options.out, result);
	return { experiment, campaignFiles, reportFiles, result, ...written, cells };
}

export interface ExperimentAnalyseOptions {
	file: string;
	out: string;
	now?: () => string;
}

/** Re-fold the reports `run` left in `--out` (one per campaign id) into a fresh result. */
export async function experimentAnalyse(
	options: ExperimentAnalyseOptions
): Promise<Omit<ExperimentRunReport, 'campaignFiles' | 'cells'>> {
	const designed = await readExperiment(options.file);
	const { experiment } = expandExperiment(designed);
	const reports: CampaignReport[] = [];
	const reportFiles: string[] = [];
	for (const campaignId of experiment.campaigns) {
		const file = reportPath(options.out, campaignId);
		try {
			reports.push(parseCampaignReport(JSON.parse(await readFile(file, 'utf8'))));
			reportFiles.push(file);
		} catch (error) {
			if (isMissing(error)) continue;
			throw error;
		}
	}
	const ranAt = (options.now ?? (() => new Date().toISOString()))();
	const result = analyseExperiment(experiment, reports, { ranAt });
	const written = await writeResult(options.out, result);
	return { experiment, reportFiles, result, ...written };
}

/** A stored result as markdown, its digest verified on the way. */
export async function experimentRender(file: string): Promise<string> {
	const result = parseExperimentResult(JSON.parse(await readFile(file, 'utf8')));
	return renderExperimentMarkdown(result);
}

function isMissing(error: unknown): boolean {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
