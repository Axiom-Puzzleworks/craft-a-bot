import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	parseWorkflowRun,
	type DeskWorldState,
	type PackManifest,
	type WorkItem,
	type WorkflowSpec
} from '@craftabot/core';
import { v1BrickKinds } from '@craftabot/core/testing';
import { afterAll, describe, expect, it } from 'vitest';
import { TEST_DESK_ID, testDesk } from '@craftabot/desk/testing';
import { credentialsFromEnv } from '../credentials.js';
import { main as runCli, type CliIo } from '../cli.js';
import { workflowRun } from './workflow.js';

/**
 * WP79 stage C: `craftabot workflow run` over a pack that ships one
 * workflow — a rule stage, a human stage — on the runtime's test desk, so
 * the command is proved without any pack's own workflow (WP80's is the
 * first). The registry is a config of one pack; no kit, no agent stage.
 */
const roots: string[] = [];
async function tempDir(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-workflow-'));
	roots.push(root);
	return root;
}
afterAll(async () => {
	await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const VISIT: WorkflowSpec = {
	id: 'test/visit',
	name: 'A visit',
	worldId: TEST_DESK_ID,
	purpose: 'Sign a visitor in',
	intake: (item) => ({ layoutId: 'one-visitor', input: item.payload }),
	first: 'sign',
	stages: [
		{
			id: 'sign',
			name: 'Sign in',
			input: { type: 'object', required: ['visitor'] },
			output: { type: 'object', required: ['signedIn'] },
			executor: { kind: 'rule', rule: 'sign' },
			// Read only when a bot does the stage; a rule returns its own output (`69-…` §3).
			read: (state) => ({ signedIn: (state as DeskWorldState).queue[0]?.status === 'decided' }),
			next: () => 'review'
		},
		{
			id: 'review',
			name: 'Review',
			input: { type: 'object' },
			output: { type: 'object', required: ['decision'] },
			executor: { kind: 'human', prompt: 'Let them through?', options: ['yes', 'no'] },
			next: () => 'end'
		}
	],
	rules: {
		sign: (input) => ({
			output: { signedIn: true },
			call: { name: 'sign-in', arguments: { visitor: (input as { visitor: string }).visitor } }
		})
	},
	obligations: [],
	configurations: {
		'no-review': { executors: { review: { kind: 'rule', rule: 'skip' } } }
	}
};

const PACK: PackManifest = {
	id: 'test',
	name: 'Test desk pack',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	worlds: [testDesk],
	brickKinds: v1BrickKinds(),
	workflows: [VISIT]
};

const ITEM: WorkItem = {
	id: 'item-7',
	kind: 'application',
	customerId: 'customer-7',
	arrivedAt: '2026-01-05T09:00:00Z',
	payload: { visitor: 'A. Person' },
	truth: { records: [] }
};

async function itemFile(root: string): Promise<string> {
	const path = join(root, 'item.json');
	await writeFile(path, JSON.stringify(ITEM), 'utf8');
	return path;
}

function io(): CliIo & { out: string[]; err: string[] } {
	const out: string[] = [];
	const err: string[] = [];
	return {
		out,
		err,
		stdout: (text) => void out.push(text),
		stderr: (text) => void err.push(text),
		env: {}
	};
}

describe('workflowRun', () => {
	it('runs a rule stage and a human stage and writes the workflow run', async () => {
		const root = await tempDir();
		const report = await workflowRun({
			workflowId: 'test/visit',
			itemPath: await itemFile(root),
			brain: 'scripted-optimal',
			seed: 1,
			out: join(root, 'runs'),
			decisions: { review: 'no' },
			config: { packs: [PACK] },
			credentials: credentialsFromEnv({}),
			now: () => '2026-09-10T10:00:00.000Z'
		});
		expect(report.outcome).toBe('completed');
		expect(report.stages).toEqual([
			{ stageId: 'sign', executor: 'rule', status: 'ok' },
			{ stageId: 'review', executor: 'human', status: 'escalated' }
		]);
		expect(report.runIds).toEqual([]);
		const written = parseWorkflowRun(JSON.parse(await readFile(report.file, 'utf8')));
		expect(written.digest).toBe(report.digest);
		expect(written.stages[0]?.output.value).toEqual({ signedIn: true });
		expect(written.stages[1]?.approval).toEqual({ requested: true, decision: 'no' });
		expect(written.events.map((event) => event.type)).toEqual([
			'stage.started',
			'action.performed',
			'stage.completed',
			'stage.started',
			'approval.requested',
			'approval.resolved',
			'stage.completed'
		]);
	});

	it('takes a named configuration and refuses an unknown one', async () => {
		const root = await tempDir();
		const base = {
			workflowId: 'test/visit',
			itemPath: await itemFile(root),
			brain: 'scripted-optimal' as const,
			seed: 1,
			out: join(root, 'runs'),
			config: { packs: [PACK] },
			credentials: credentialsFromEnv({})
		};
		const report = await workflowRun({ ...base, configName: 'no-review' });
		expect(report.configName).toBe('no-review');
		expect(report.stages[1]).toMatchObject({
			executor: 'rule',
			status: 'error',
			finding: 'no rule "skip"'
		});
		expect(report.outcome).toBe('stopped');
		await expect(workflowRun({ ...base, configName: 'nope' })).rejects.toThrow(
			"has no configuration 'nope' — it has no-review"
		);
		await expect(workflowRun({ ...base, workflowId: 'test/none' })).rejects.toThrow(
			"no workflow 'test/none' — the installed packs ship test/visit"
		);
	});

	it('names the missing kit when an agent stage comes', async () => {
		const root = await tempDir();
		const agentic: WorkflowSpec = {
			...VISIT,
			stages: [{ ...VISIT.stages[0]!, executor: { kind: 'agent', until: 'signed-in' } }]
		};
		await expect(
			workflowRun({
				workflowId: 'test/visit',
				itemPath: await itemFile(root),
				brain: 'scripted-optimal',
				seed: 1,
				out: join(root, 'runs'),
				config: { packs: [{ ...PACK, workflows: [agentic] }] },
				credentials: credentialsFromEnv({})
			})
		).rejects.toThrow('hand it a bot with --kit');
	});
});

describe('craftabot workflow run', () => {
	it('wants its verb and flags', async () => {
		const console = io();
		expect(await runCli(['workflow'], console)).toBe(1);
		expect(console.err.join('')).toContain('workflow needs run --workflow <id> --item <item.json>');
		expect(
			await runCli(
				['workflow', 'run', '--workflow', 'x', '--item', 'y', '--decide', 'bad'],
				console
			)
		).toBe(1);
		expect(console.err.join('')).toContain('--decide wants <stageId>=<option> pairs');
	});

	it('names the workflows the installed packs ship when the one asked for is not among them', async () => {
		const root = await tempDir();
		const console = io();
		const code = await runCli(
			[
				'workflow',
				'run',
				'--workflow',
				'test/visit',
				'--item',
				await itemFile(root),
				'--out',
				join(root, 'runs')
			],
			console
		);
		expect(code).toBe(1);
		expect(console.err.join('')).toContain(
			"no workflow 'test/visit' — the installed packs ship fs-advice/advice, fs-advice/complaints, fs-fraud/fraud, fs-lending/lending"
		);
	});
});
