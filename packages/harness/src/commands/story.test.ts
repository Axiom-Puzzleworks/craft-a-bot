import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EngineEvent } from '@craftabot/core';
import { injectionBaseline } from '@craftabot/evals';
import { main } from '../cli.js';
import { defaultConfig } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { createFileStorage } from '../storage/file-storage.js';
import { snackbotKit } from '../testing/kit-fixture.js';
import { bankRun } from './bank.js';
import { runCampaignFile } from './campaign.js';
import { runKit } from './run.js';
import { storyClassOf, storyOf } from './story.js';

/**
 * `craftabot story` (WP161, `112-REAL-ENOUGH-PLAN.md` §5): a stored run, or a
 * work item through its journey, told top to bottom — from the CLI, with a
 * campaign's sampled stories beside its report, redacted against every secret
 * the process holds, and never written to the store.
 */
const roots: string[] = [];
async function tmp(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-story-'));
	roots.push(root);
	return root;
}
afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

function io(env: NodeJS.ProcessEnv = {}) {
	const sink = {
		out: '',
		err: '',
		env,
		stdout: (text: string) => void (sink.out += text),
		stderr: (text: string) => void (sink.err += text)
	};
	return sink;
}

describe('craftabot story — one run', () => {
	let root: string;
	let runId: string;
	let out: string;
	beforeAll(async () => {
		root = await tmp();
		const kit = join(root, 'bot.craftabot.json');
		await writeFile(kit, JSON.stringify(snackbotKit()), 'utf8');
		out = join(root, 'runs');
		const report = await runKit({
			kitPath: kit,
			brain: 'scripted-optimal',
			seed: 1,
			out,
			config: defaultConfig(),
			credentials: credentialsFromEnv({})
		});
		runId = report.runId;
	});

	it('tells a stored run as markdown, to the terminal or to a file', async () => {
		const printed = io();
		expect(await main(['story', runId, '--store', out], printed)).toBe(0);
		expect(printed.out).toContain('**saw**');
		expect(printed.out).toContain('**thought** — It decided');
		expect(printed.out).toContain('## How it ended');
		expect(printed.out).toContain('- **Outcome:** SUCCESS');

		const file = join(root, 'story.md');
		const written = io();
		expect(await main(['story', runId, '--store', out, '--out', file], written)).toBe(0);
		expect(written.out).toContain('wrote');
		expect(await readFile(file, 'utf8')).toBe(printed.out);
	});

	it('renders HTML and JSON, and refuses an unknown id or format', async () => {
		const html = io();
		expect(await main(['story', runId, '--store', out, '--format', 'html'], html)).toBe(0);
		expect(html.out).toMatch(/^<!doctype html>/);
		expect(html.out).not.toMatch(/<script/i);
		const json = io();
		expect(await main(['story', runId, '--store', out, '--format', 'json'], json)).toBe(0);
		expect(JSON.parse(json.out)).toMatchObject({ version: 1, subject: { kind: 'run', id: runId } });

		const missing = io();
		expect(await main(['story', 'nope', '--store', out], missing)).toBe(1);
		expect(missing.err).toContain("no run or journey 'nope'");
		const badFormat = io();
		expect(await main(['story', runId, '--store', out, '--format', 'pdf'], badFormat)).toBe(1);
		expect(badFormat.err).toContain('story needs <runId | itemId>');
	});

	it('is the same story twice, and writes nothing to the store', async () => {
		const before = (await readdir(out)).sort();
		const a = io();
		const b = io();
		await main(['story', runId, '--store', out], a);
		await main(['story', runId, '--store', out], b);
		expect(a.out).toBe(b.out);
		expect((await readdir(out)).sort()).toEqual(before);
	});

	it('redacts every secret the process holds, even one that reached an event', async () => {
		const secret = 'sk-planted-story-secret-0123456789';
		const dir = await tmp();
		const storage = await createFileStorage(dir);
		const base = (await createFileStorage(out)).getRun;
		const record = await base(runId);
		if (!record) throw new Error('the fixture run is stored');
		const events = (await (await createFileStorage(out)).getEvents(runId)).map((row) => row.event);
		const leaky = events.map((event) =>
			event.type === 'decision'
				? ({
						...event,
						payload: { ...event.payload, thought: `my key is ${secret}` }
					} as EngineEvent)
				: event
		);
		await storage.putRun(record);
		await storage.appendEvents(runId, leaky);
		const told = await storyOf({ storage, store: dir, id: runId, secrets: [secret] });
		expect(JSON.stringify(told.story)).not.toContain(secret);
		const unredacted = await storyOf({ storage, store: dir, id: runId });
		expect(JSON.stringify(unredacted.story)).toContain(secret);
	});
});

describe('craftabot story — a work item through its journey', () => {
	it('tells an item from a bank day by its id, stage by stage, truth last', async () => {
		const root = await tmp();
		const desks = join(import.meta.dirname, '../../../../campaigns/desks/bank-day.json');
		const out = join(root, 'out');
		const result = await bankRun({
			day: '2026-06-10',
			desksPath: desks,
			seed: 1,
			size: 500,
			brain: 'scripted-optimal',
			out,
			config: defaultConfig(),
			credentials: credentialsFromEnv({}),
			egress: 'none'
		});
		expect(result.bankRun.runs.length).toBeGreaterThan(0);
		const storage = await createFileStorage(out);
		const first = (await storage.listWorkflowRuns())[0];
		if (!first) throw new Error('the bank day wrote a workflow run');

		const told = io();
		expect(await main(['story', first.run.itemId, '--store', out], told)).toBe(0);
		expect(told.out).toContain('## What arrived');
		for (const stage of first.run.stages) expect(told.out).toContain(`Stage ${stage.stageId}`);
		expect(told.out.indexOf('## How it ended')).toBeGreaterThan(
			told.out.indexOf('## What arrived')
		);
		// The same journey by its own run id.
		const byRun = io();
		expect(await main(['story', first.run.id, '--store', out], byRun)).toBe(0);
		expect(byRun.out).toBe(told.out);
		// A bot stage's own run is told inside it.
		if (first.run.stages.some((stage) => stage.runId)) expect(told.out).toContain('### Turn 1');
	}, 300_000);
});

describe('a campaign’s sampled stories', () => {
	it('names the classes a cell can fall in', () => {
		expect(storyClassOf({ outcome: 'SUCCESS', evaluations: {} })).toBe(
			'success-no-failed-evaluation'
		);
		expect(storyClassOf({ outcome: 'OUT_OF_STEPS', evaluations: { a: 'pass', b: 'fail' } })).toBe(
			'out_of_steps-failed-evaluation'
		);
		expect(storyClassOf({})).toBe('unfinished-no-failed-evaluation');
	});

	it('tells n cells per class beside the report, the same cells every time', async () => {
		const root = await tmp();
		const file = join(root, 'baseline.json');
		await writeFile(file, JSON.stringify(injectionBaseline([1])), 'utf8');
		const options = {
			file,
			config: defaultConfig(),
			credentials: credentialsFromEnv({}),
			egress: 'none' as const,
			stories: 1
		};
		const first = join(root, 'a');
		const second = join(root, 'b');
		await runCampaignFile({ ...options, out: first });
		await runCampaignFile({ ...options, out: second });

		const classes = (await readdir(join(first, 'stories'))).sort();
		expect(classes.length).toBeGreaterThan(0);
		let total = 0;
		for (const klass of classes) {
			const files = await readdir(join(first, 'stories', klass));
			// n = 1: one story per class.
			expect(files).toHaveLength(1);
			total += files.length;
			const text = await readFile(join(first, 'stories', klass, files[0] as string), 'utf8');
			expect(text).toContain('## How it ended');
			// The same cell is sampled by the same campaign.
			expect(await readdir(join(second, 'stories', klass))).toEqual(files);
		}
		expect(total).toBe(classes.length);
		// Without --stories nothing is written.
		const plain = join(root, 'c');
		await runCampaignFile({ ...options, stories: 0, out: plain });
		await expect(readdir(join(plain, 'stories'))).rejects.toThrow();
	}, 300_000);
});
