import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	localPackFrom,
	workItemSchema,
	type AgentSpecV2,
	type EgressMode,
	type Guardrail,
	type Principal,
	type StageRecord,
	type WorkflowRun,
	type WorkflowSpec
} from '@craftabot/core';
import { compilePolicyCard } from '@craftabot/governance';
import { runWorkflow } from '@craftabot/workflow';
import { createAgentRunWriter } from '../agent-runs.js';
import { createRegistry, packVersions, type HarnessConfig } from '../config.js';
import type { CredentialSource } from '../credentials.js';
import { mulberry32 } from '../random.js';
import { createFileStorage } from '../storage/file-storage.js';
import { chooseBrain, loadSpecFrom, type BrainTier } from './run.js';

/**
 * `craftabot workflow run` (WP79 stage C, `69-WORKFLOWS.md` §8): one
 * workflow a pack ships over one work item, every agent stage's run written
 * exactly as `run` writes a run (the record, the events, the summary, the
 * trace file), and the `WorkflowRun` itself under `<out>/workflows/<id>/`.
 * Human stages answer from `--decide <stageId>=<option>`, else the
 * executor's default; approvals inside an agent stage as `run`'s do.
 */
export interface WorkflowRunOptions {
	workflowId: string;
	itemPath: string;
	/** A named configuration off the workflow (`configurations`); absent, the spec's defaults. */
	configName?: string;
	/** The bot every agent stage seats; needed only when a stage's executor is the bot. */
	kitPath?: string;
	brain: BrainTier;
	seed: number;
	out: string;
	approve?: boolean;
	/** The scripted answers for human stages, by stage id. */
	decisions?: Record<string, string>;
	config: HarnessConfig;
	credentials: CredentialSource;
	now?: () => string;
	newId?: () => string;
	egress?: EgressMode;
	principal?: Principal;
}

export interface WorkflowRunReport {
	runId: string;
	workflowId: string;
	itemId: string;
	configName?: string;
	outcome: WorkflowRun['outcome'];
	stages: Array<{
		stageId: string;
		executor: StageRecord['executor']['kind'];
		status: StageRecord['status'];
		finding?: string;
		runId?: string;
	}>;
	runIds: string[];
	digest: string;
	directory: string;
	file: string;
}

export async function workflowRun(options: WorkflowRunOptions): Promise<WorkflowRunReport> {
	const registry = createRegistry(options.config);
	const workflow = workflowById(registry.listWorkflows(), options.workflowId);
	const config = configOf(workflow, options.configName);
	const item = workItemSchema.parse(JSON.parse(await readFile(options.itemPath, 'utf8')));
	const spec: AgentSpecV2 | undefined = options.kitPath
		? await loadSpecFrom(options.kitPath, options.config, registry)
		: undefined;

	const storage = await createFileStorage(options.out);
	const now = options.now ?? (() => new Date().toISOString());
	// Every agent run written as `run` writes one (WP79; shared with the bank since WP83).
	const writer = createAgentRunWriter({
		storage,
		out: options.out,
		packVersions: packVersions(options.config),
		secrets: options.credentials.secrets(),
		now
	});

	const record = await runWorkflow(workflow, item, {
		packs: [...options.config.packs, localPackFrom(options.config.content ?? [])],
		spec: spec ?? placeholderSpec(),
		...(config ? { config } : {}),
		providerFor: (_stage, goalCardId) => {
			if (!spec) {
				throw new Error(
					`workflow '${workflow.id}' has an agent stage — hand it a bot with --kit <bot.craftabot.json>`
				);
			}
			return chooseBrain({ ...spec, goalCardId }, registry, options).provider;
		},
		guardrailsFor: (cardIds) =>
			cardIds.flatMap((id): Guardrail[] => {
				const card = registry.getPolicyCard(id);
				if (!card) throw new Error(`stage guard names no installed policy card '${id}'`);
				return compilePolicyCard(card);
			}),
		human: (stage, _state, executor, suggested) => ({
			decision:
				options.decisions?.[stage.id] ?? suggested ?? executor.default ?? executor.options[0] ?? ''
		}),
		approve: () => options.approve ?? true,
		now,
		seed: options.seed,
		random: mulberry32(options.seed),
		session: {
			now,
			random: mulberry32(options.seed),
			tickDelayMs: 0,
			...(options.newId ? { newId: options.newId } : {}),
			egress: options.egress ?? 'declared',
			...(options.principal ? { principal: options.principal } : {})
		},
		...(options.newId ? { newId: options.newId } : {}),
		...(options.egress ? { egress: options.egress } : {}),
		...(options.principal ? { principal: options.principal } : {}),
		getCredential: (id) => options.credentials.get(id),
		onAgentRun: (agentRun) => {
			void writer.write(agentRun.runId, agentRun.spec, agentRun.events);
		}
	});

	// Every agent run is on disk before the workflow's own record is.
	await writer.done();
	const directory = join(options.out, 'workflows', record.id);
	await mkdir(directory, { recursive: true });
	const file = join(directory, 'workflow-run.json');
	await writeFile(file, `${JSON.stringify(record, null, '\t')}\n`, 'utf8');

	return {
		runId: record.id,
		workflowId: record.workflowId,
		itemId: record.itemId,
		...(options.configName !== undefined ? { configName: options.configName } : {}),
		outcome: record.outcome,
		stages: record.stages.map((stage) => ({
			stageId: stage.stageId,
			executor: stage.executor.kind,
			status: stage.status,
			...(stage.finding !== undefined ? { finding: stage.finding } : {}),
			...(stage.runId !== undefined ? { runId: stage.runId } : {})
		})),
		runIds: record.runIds,
		digest: record.digest,
		directory,
		file
	};
}

function workflowById(workflows: WorkflowSpec[], id: string): WorkflowSpec {
	const found = workflows.find((workflow) => workflow.id === id);
	if (found) return found;
	const known = workflows.map((workflow) => workflow.id);
	throw new Error(
		known.length === 0
			? `no installed pack ships a workflow (asked for '${id}')`
			: `no workflow '${id}' — the installed packs ship ${known.join(', ')}`
	);
}

function configOf(workflow: WorkflowSpec, name: string | undefined) {
	if (name === undefined) return undefined;
	const config = workflow.configurations?.[name];
	if (!config) {
		const known = Object.keys(workflow.configurations ?? {});
		throw new Error(
			known.length === 0
				? `workflow '${workflow.id}' has no named configurations (asked for '${name}')`
				: `workflow '${workflow.id}' has no configuration '${name}' — it has ${known.join(', ')}`
		);
	}
	return config;
}

/** Stands in for the bot when no kit was given — only a workflow with no agent stage can run on it. */
function placeholderSpec(): AgentSpecV2 {
	return {
		id: '00000000-0000-4000-8000-0000000000ff',
		name: 'No bot',
		goalCardId: '',
		bricks: [],
		createdAt: '2026-09-10T00:00:00Z',
		updatedAt: '2026-09-10T00:00:00Z',
		schemaVersion: 2
	} as unknown as AgentSpecV2;
}
