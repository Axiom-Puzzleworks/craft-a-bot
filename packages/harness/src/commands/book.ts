import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { slugOf, type EgressMode, type Principal } from '@craftabot/core';
import { parseCampaign, type Campaign } from '@craftabot/evals';
import { createRegistry, type HarnessConfig } from '../config.js';
import type { CredentialSource } from '../credentials.js';
import { runCampaignFile, type CampaignFileReport } from './campaign.js';
import { loadSpecFrom, type BrainTier } from './run.js';

/**
 * **`craftabot book run`** (WP80, `64-TARGET-DESIGN-V5.md` §6.6.3; `73-…`
 * §5): a book through a workflow's configurations as a campaign — the
 * campaign file written beside the report, so what ran is a file CI could
 * run — then `craftabot campaign`'s own road: the pool under `--jobs`, the
 * runs kept, the report and its renderings. The book is drawn by the
 * workflow from a population at `--population <seed> --size <n>`; the
 * builds are one per configuration named (`--config a,b`, every named one
 * by default), the bot `--kit`'s or the world's default senses and actions;
 * one guard, one brain. The one gate always passes: a book run is a
 * measurement, and the gates a judgment needs come in a campaign file.
 */
export interface BookRunOptions {
	workflowId: string;
	seed: number;
	size: number;
	periodDays?: number;
	limit?: number;
	configurations?: string[];
	kitPath?: string;
	brain: BrainTier;
	out: string;
	jobs?: number;
	config: HarnessConfig;
	credentials: CredentialSource;
	now?: () => string;
	newId?: () => string;
	egress?: EgressMode;
	principal?: Principal;
	markdown?: string;
}

export interface BookRunReport extends CampaignFileReport {
	campaignFile: string;
	cells: number;
}

export async function bookRun(options: BookRunOptions): Promise<BookRunReport> {
	const registry = createRegistry(options.config);
	const workflow = registry.getWorkflow(options.workflowId);
	if (!workflow) {
		const known = registry.listWorkflows().map((entry) => entry.id);
		throw new Error(
			known.length === 0
				? `no installed pack ships a workflow (asked for '${options.workflowId}')`
				: `no workflow '${options.workflowId}' — the installed packs ship ${known.join(', ')}`
		);
	}
	if (!workflow.book)
		throw new Error(
			`workflow '${workflow.id}' draws no book; run a campaign file with the book inline`
		);
	const named = Object.keys(workflow.configurations ?? {});
	const configurations = options.configurations ?? (named.length > 0 ? named : []);
	for (const id of configurations) {
		if (!named.includes(id)) {
			throw new Error(
				`workflow '${workflow.id}' has no configuration '${id}'${named.length > 0 ? ` — it has ${named.join(', ')}` : ''}`
			);
		}
	}
	const world = registry.getWorld(workflow.worldId);
	const spec = options.kitPath
		? await loadSpecFrom(options.kitPath, options.config, registry)
		: undefined;
	const kit = options.kitPath ? JSON.parse(await readFile(options.kitPath, 'utf8')) : undefined;
	const overrides = spec
		? {}
		: {
				senses: (world?.senses ?? []).map((sense) => sense.id),
				actions: (world?.actions ?? []).map((action) => action.id)
			};
	const builds = (configurations.length > 0 ? configurations : ['default']).map((id) => ({
		id,
		base: kit ? { kind: 'kit', kit } : { kind: 'starter-default' },
		overrides: { ...overrides, ...(named.includes(id) ? { configuration: id } : {}) }
	}));
	const campaign = {
		schemaVersion: 1,
		id: `book-${slugOf(workflow.id)}-${options.seed}-${options.size}`,
		title: `${workflow.name} — the book at seed ${options.seed}, ${options.size} customers, ${builds.map((build) => build.id).join(', ')}`,
		scenarios: [],
		source: {
			kind: 'book',
			workflowId: workflow.id,
			population: {
				seed: options.seed,
				size: options.size,
				...(options.periodDays !== undefined ? { periodDays: options.periodDays } : {})
			},
			...(options.limit !== undefined ? { limit: options.limit } : {})
		},
		builds,
		guards: [{ id: 'none', fit: [] }],
		brains: [{ id: options.brain, tier: options.brain }],
		seeds: [options.seed],
		gates: [
			{
				id: 'a-measurement-not-a-judgment',
				require: { kind: 'outcome-rate', outcome: 'SUCCESS', atLeast: 0 }
			}
		]
	};
	const parsed = parseCampaign(campaign);
	await mkdir(options.out, { recursive: true });
	const campaignFile = join(options.out, `${parsed.id}.campaign.json`);
	await writeFile(campaignFile, `${JSON.stringify(campaign, null, '\t')}\n`, 'utf8');
	const report = await runCampaignFile({
		file: campaignFile,
		out: options.out,
		config: options.config,
		credentials: options.credentials,
		...(options.jobs !== undefined ? { jobs: options.jobs } : {}),
		...(options.now ? { now: options.now } : {}),
		...(options.newId ? { newId: options.newId } : {}),
		...(options.egress !== undefined ? { egress: options.egress } : {}),
		...(options.principal ? { principal: options.principal } : {}),
		...(options.markdown !== undefined ? { markdown: options.markdown } : {})
	});
	return { ...report, campaignFile, cells: report.report.cells.length };
}

/**
 * **`craftabot sweep`** (`64-…` §6.6.3): sugar over builds — every build of a
 * campaign file × every value of one knob, one build per value named
 * `<build>@<knob>=<value>`, the swept campaign written beside the report
 * and run as any campaign is. A knob value parses as a number or a boolean
 * when it is one, else it is the string.
 */
export interface SweepOptions {
	file: string;
	knob: string;
	values: string[];
	out: string;
	jobs?: number;
	config: HarnessConfig;
	credentials: CredentialSource;
	now?: () => string;
	newId?: () => string;
	egress?: EgressMode;
	principal?: Principal;
	markdown?: string;
}

export function knobValue(text: string): number | string | boolean {
	if (text === 'true') return true;
	if (text === 'false') return false;
	const number = Number(text);
	return text.trim() !== '' && Number.isFinite(number) ? number : text;
}

export function sweptCampaign(
	campaign: Campaign,
	knob: string,
	values: readonly string[]
): Campaign {
	const builds = campaign.builds.flatMap((build) =>
		values.map((value) => ({
			...build,
			id: `${build.id}@${knob}=${value}`,
			overrides: {
				...(build.overrides ?? {}),
				knobs: { ...(build.overrides?.knobs ?? {}), [knob]: knobValue(value) }
			}
		}))
	);
	return {
		...campaign,
		id: `${campaign.id}-sweep-${slugOf(knob)}`,
		title: `${campaign.title} — ${knob} swept over ${values.join(', ')}`,
		builds
	};
}

export async function sweepRun(options: SweepOptions): Promise<BookRunReport> {
	if (options.values.length === 0) throw new Error('--knob wants <name>=<v1>,<v2>,…');
	const campaign = parseCampaign(JSON.parse(await readFile(options.file, 'utf8')));
	const swept = sweptCampaign(campaign, options.knob, options.values);
	await mkdir(options.out, { recursive: true });
	const campaignFile = join(options.out, `${swept.id}.campaign.json`);
	await writeFile(campaignFile, `${JSON.stringify(swept, null, '\t')}\n`, 'utf8');
	const report = await runCampaignFile({
		file: campaignFile,
		out: options.out,
		config: options.config,
		credentials: options.credentials,
		...(options.jobs !== undefined ? { jobs: options.jobs } : {}),
		...(options.now ? { now: options.now } : {}),
		...(options.newId ? { newId: options.newId } : {}),
		...(options.egress !== undefined ? { egress: options.egress } : {}),
		...(options.principal ? { principal: options.principal } : {}),
		...(options.markdown !== undefined ? { markdown: options.markdown } : {})
	});
	return { ...report, campaignFile, cells: report.report.cells.length };
}
