import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ConfusionLabelSemantics } from '@craftabot/core';
import {
	evaluateGate,
	parseCampaign,
	parseCampaignReport,
	prepareCampaign,
	renderCampaignScorecard,
	renderJUnit,
	renderSarif,
	resolveEvaluator,
	summariseCampaign,
	type CampaignCell,
	type CampaignReport
} from '@craftabot/evals';
import { packVersions, type HarnessConfig } from '../config.js';

/**
 * **`craftabot merge`** (WP68, `57-HARNESS-AT-SCALE.md` §4.2): shard
 * reports folded into one — the cells concatenated and sorted by ordinal,
 * the gates and the summary recomputed over the whole against the campaign
 * file, the spend summed, `shard` dropped. Refused when the reports name
 * different campaigns, when two carry the same ordinal, or when the summed
 * live cells exceed the campaign's `maxLiveCells`: spend is a property of
 * the artefact, enforced at every join (`57-…` §3).
 */
export interface MergeOptions {
	file: string;
	reports: string[];
	out: string;
	junit?: string;
	sarif?: string;
	markdown?: string;
	baseline?: string;
	config: HarnessConfig;
	now?: () => string;
	newId?: () => string;
}

export interface MergeReport {
	report: CampaignReport;
	reportFile: string;
	written: string[];
}

/** The fold itself, pure over parsed reports — what the command writes and what a test checks. */
export function mergeCampaignReports(
	campaign: ReturnType<typeof parseCampaign>,
	reports: readonly CampaignReport[],
	options: {
		semantics: (evaluatorId: string) => ConfusionLabelSemantics | undefined;
		packVersions: Record<string, string>;
		baseline?: CampaignReport;
		now?: () => string;
		newId?: () => string;
	}
): CampaignReport {
	if (reports.length === 0) throw new Error('merge needs at least one report');
	for (const report of reports) {
		if (report.campaignId !== campaign.id) {
			throw new Error(
				`report '${report.id}' is of campaign '${report.campaignId}', not '${campaign.id}'`
			);
		}
	}
	const cells: CampaignCell[] = [];
	const seen = new Map<number, string>();
	for (const report of reports) {
		for (const cell of report.cells) {
			if (cell.ordinal === undefined) {
				throw new Error(
					`report '${report.id}' has a cell with no ordinal — written before WP68; it cannot be merged`
				);
			}
			const other = seen.get(cell.ordinal);
			if (other !== undefined) {
				throw new Error(
					`cell ${cell.ordinal} is in both report '${other}' and report '${report.id}' — the shards overlap`
				);
			}
			seen.set(cell.ordinal, report.id);
			cells.push(cell);
		}
	}
	cells.sort((a, b) => (a.ordinal as number) - (b.ordinal as number));
	const liveCells = reports.reduce((total, report) => total + report.budget.liveCells, 0);
	if (liveCells > 0) {
		if (!campaign.budget) {
			throw new Error(
				`the reports spent ${liveCells} live cells and campaign '${campaign.id}' has no budget`
			);
		}
		if (liveCells > campaign.budget.maxLiveCells) {
			throw new Error(
				`the reports spent ${liveCells} live cells together but campaign '${campaign.id}' allows ${campaign.budget.maxLiveCells} (budget.maxLiveCells)`
			);
		}
	}
	const gates = campaign.gates.map((gate) =>
		evaluateGate(gate, cells, options.baseline, {
			semantics: options.semantics,
			counterpart: campaign.counterpart ?? { tier: 'scripted' }
		})
	);
	const first = reports[0] as CampaignReport;
	return {
		schemaVersion: first.schemaVersion,
		id: options.newId?.() ?? crypto.randomUUID(),
		campaignId: campaign.id,
		campaignTitle: campaign.title,
		createdAt: options.now?.() ?? new Date().toISOString(),
		packVersions: options.packVersions,
		noise: first.noise,
		builds: first.builds,
		cells,
		gates,
		passed: gates.every((gate) => gate.passed),
		counterpart: campaign.counterpart ?? { tier: 'scripted' },
		summary: summariseCampaign(cells, { semantics: options.semantics, gates }),
		budget: {
			liveCells,
			tokensIn: reports.reduce((total, report) => total + report.budget.tokensIn, 0),
			tokensOut: reports.reduce((total, report) => total + report.budget.tokensOut, 0),
			liveEvaluations: reports.reduce((total, report) => total + report.budget.liveEvaluations, 0)
		}
	};
}

export async function mergeReports(options: MergeOptions): Promise<MergeReport> {
	const campaign = parseCampaign(JSON.parse(await readFile(options.file, 'utf8')));
	const reports = await Promise.all(
		options.reports.map(async (path) =>
			parseCampaignReport(JSON.parse(await readFile(path, 'utf8')))
		)
	);
	const baseline =
		options.baseline === undefined
			? undefined
			: parseCampaignReport(JSON.parse(await readFile(options.baseline, 'utf8')));
	const { registry } = prepareCampaign(campaign, { packs: options.config.packs });
	const semantics = (evaluatorId: string): ConfusionLabelSemantics | undefined => {
		const found = resolveEvaluator(registry, evaluatorId)?.labelSemantics;
		return found?.kind === 'confusion' ? found : undefined;
	};
	const report = mergeCampaignReports(campaign, reports, {
		semantics,
		packVersions: packVersions(options.config),
		...(baseline ? { baseline } : {}),
		...(options.now ? { now: options.now } : {}),
		...(options.newId ? { newId: options.newId } : {})
	});
	await mkdir(options.out, { recursive: true });
	const reportFile = join(options.out, `${report.id}.campaign-report.json`);
	const written: string[] = [reportFile];
	await writeFile(reportFile, `${JSON.stringify(report, null, '\t')}\n`, 'utf8');
	const renderings: Array<[string | undefined, () => string]> = [
		[options.markdown, () => renderCampaignScorecard(report)],
		[options.junit, () => renderJUnit(report)],
		[
			options.sarif,
			() =>
				`${JSON.stringify(renderSarif(report, { campaignUri: options.file.replace(/\\/g, '/') }), null, '\t')}\n`
		]
	];
	for (const [path, render] of renderings) {
		if (path === undefined) continue;
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, render(), 'utf8');
		written.push(path);
	}
	return { report, reportFile, written };
}
