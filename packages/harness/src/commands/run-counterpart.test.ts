import { brickKindsFor, buildKitFile, caretRangesFor, parseTraceBundle } from '@craftabot/core';
import { buildSpec } from '@craftabot/pack-starter/testing';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { createRegistry, defaultConfig, packVersions } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { createFileStorage } from '../storage/file-storage.js';
import { FIXTURE_CARTRIDGE } from '../testing/kit-fixture.js';
import { parseCampaign } from '@craftabot/evals';
import { runKit } from './run.js';

/**
 * `craftabot run --counterpart` (WP55 stage C, `46-…` §4.6): a desk kit and
 * a scripted visitor as a two-seat episode, written the way the Kit's duo
 * writes one and bundled; reproducible from the seed; refused on a room.
 */
const roots: string[] = [];
afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

async function tmp(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-duo-'));
	roots.push(root);
	return root;
}

const config = defaultConfig();
const credentials = credentialsFromEnv({});

/** A bot built for the Front Desk: the desk's channels and actions, the fixture cartridge. */
async function writeDeskKit(root: string): Promise<string> {
	const registry = createRegistry(config);
	const spec = buildSpec({
		id: '66666666-6666-4666-8666-666666666666',
		name: 'Deskbot',
		goalCardId: 'workshop/sign-the-visitor-in',
		// Qualified: the starter's bricks qualify a bare id with the Playroom's (`12-…` D20).
		senses: [
			'workshop/the-desk/conversation',
			'workshop/the-desk/case-file',
			'workshop/the-desk/queue'
		],
		actions: [
			'workshop/the-desk/say',
			'workshop/the-desk/look-up',
			'workshop/the-desk/sign-in',
			'workshop/the-desk/escalate'
		],
		tools: []
	});
	if (spec.bricks.llm) spec.bricks.llm.cartridgeId = FIXTURE_CARTRIDGE;
	const kit = buildKitFile(spec, {
		exportedBy: 'craftabot-harness/test',
		exportedAt: '2026-09-05T09:00:00.000Z',
		requires: {
			core: '>=1.0.0',
			packs: caretRangesFor(packVersions(config)),
			brickKinds: brickKindsFor(spec, registry)
		}
	});
	const path = join(root, 'deskbot.craftabot.json');
	await writeFile(path, JSON.stringify(kit, null, '\t'), 'utf8');
	return path;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ADVICE_FIXTURE = resolve(HERE, '..', '..', 'fixtures', 'advice-desk.craftabot.json');
const ADVICE_BASELINE = resolve(
	HERE,
	'..',
	'..',
	'..',
	'..',
	'campaigns',
	'fs-advice-baseline.json'
);

const clock = () => {
	let calls = 0;
	return () => new Date(Date.UTC(2026, 8, 5, 9, 0, calls++)).toISOString();
};
const ids = () => {
	let n = 0;
	return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
};

describe('craftabot run --counterpart', () => {
	it('seats a scripted visitor, writes the episode and its bundle, and the visitor spoke', async () => {
		const root = await tmp();
		const kitPath = await writeDeskKit(root);
		const out = join(root, 'runs');
		const report = await runKit({
			kitPath,
			brain: 'scripted-optimal',
			seed: 3,
			out,
			config,
			credentials,
			counterpart: { brain: 'scripted' },
			now: clock(),
			newId: ids()
		});
		expect(report.groupRunId).toBeDefined();
		expect(report.counterpartProviderId).toBe('scripted-counterpart');
		expect(report.bundleFile).toBeDefined();

		const bundle = parseTraceBundle(JSON.parse(await readFile(report.bundleFile!, 'utf8')));
		expect(bundle.runs).toHaveLength(2);
		const started = bundle.group?.events.find((event) => event.type === 'group.started');
		expect(started?.payload).toMatchObject({
			memberRoles: {
				[report.agentId]: 'agent',
				[report.counterpartAgentId!]: 'counterpart'
			}
		});
		// The visitor's lines are on the transcript under the script's name.
		const changed = [...(bundle.group?.events ?? [])]
			.reverse()
			.find((event) => event.type === 'world.changed');
		const transcript = (
			changed?.payload as { state: { transcript: Array<{ speaker: string; speakerName: string }> } }
		).state.transcript;
		expect(
			transcript.some((line) => line.speaker === 'counterpart' && line.speakerName === 'Visitor')
		).toBe(true);
		expect(transcript.some((line) => line.speaker === 'agent')).toBe(true);

		// The store has both members and the group, the way the Workshop reads them.
		const storage = await createFileStorage(out);
		const group = await storage.getGroupRun(report.groupRunId!);
		expect(group?.memberRunIds).toHaveLength(2);
		expect(await storage.getRun(report.runId)).toMatchObject({ groupRunId: report.groupRunId });
	});

	it('seats the case’s own person on the Advice Desk and installs the Compliance Watchbot from the baseline (WP64)', async () => {
		const root = await tmp();
		// The committed fixture, its cartridge swapped for the test one — the scripted brains need no key.
		const kit = JSON.parse(await readFile(ADVICE_FIXTURE, 'utf8')) as {
			agent: { bricks: Array<{ slot: string; config: Record<string, unknown> }> };
		};
		const brain = kit.agent.bricks.find((brick) => brick.slot === 'brain');
		if (brain) brain.config['cartridgeId'] = FIXTURE_CARTRIDGE;
		const kitPath = join(root, 'advice.craftabot.json');
		await writeFile(kitPath, JSON.stringify(kit), 'utf8');
		const campaign = parseCampaign(JSON.parse(await readFile(ADVICE_BASELINE, 'utf8')));
		const stack = campaign.guards.find((guard) => guard.id === 'compliance-watchbot');
		expect(stack?.group?.breakOn).toEqual([
			{ evaluatorId: 'fs-advice/suitability-complete', labels: [], onFail: true }
		]);
		const out = join(root, 'runs');
		const report = await runKit({
			kitPath,
			brain: 'scripted-optimal',
			seed: 5,
			out,
			config,
			credentials,
			counterpart: { brain: 'scripted' },
			maxRounds: 10,
			now: clock(),
			newId: ids(),
			...(stack ? { stack } : {})
		});
		expect(report.groupRunId).toBeDefined();
		const bundle = parseTraceBundle(JSON.parse(await readFile(report.bundleFile!, 'utf8')));
		expect(bundle.runs).toHaveLength(2);
		// The visitor is the case's person, generated with the case — not the desk's static name (`56-…` §2 item 10).
		const visitor = bundle.runs.find((run) => run.run.id !== report.runId);
		expect(visitor?.run.agentName).toBeDefined();
		expect(visitor?.run.agentName).not.toBe('Customer');
		expect(visitor?.run.agentName).not.toBe('');
		// The stack sat at the chokepoint: the breaker looked every round; the optimal clerk never tripped it.
		const groupEvents = bundle.group?.events ?? [];
		expect(
			groupEvents.some(
				(event) =>
					event.type === 'guardrail.checked' &&
					event.payload.guardrailId === 'monitor/evaluator-breaker:fs-advice/suitability-complete'
			)
		).toBe(true);
		expect(
			groupEvents.some(
				(event) =>
					event.type === 'guardrail.tripped' &&
					event.payload.guardrailId.startsWith('monitor/evaluator-breaker:')
			)
		).toBe(false);
	});

	it('reproduces the merged stream from the seed', async () => {
		const root = await tmp();
		const kitPath = await writeDeskKit(root);
		const run = async (out: string) => {
			const report = await runKit({
				kitPath,
				brain: 'scripted-optimal',
				seed: 11,
				out,
				config,
				credentials,
				counterpart: { brain: 'scripted' },
				now: clock(),
				newId: ids()
			});
			const storage = await createFileStorage(out);
			return JSON.stringify((await storage.getEvents(report.groupRunId!)).map((row) => row.event));
		};
		expect(await run(join(root, 'a'))).toBe(await run(join(root, 'b')));
	});

	it('refuses a room', async () => {
		const root = await tmp();
		const { snackbotKit } = await import('../testing/kit-fixture.js');
		const kitPath = join(root, 'snackbot.craftabot.json');
		await writeFile(kitPath, JSON.stringify(snackbotKit()), 'utf8');
		await expect(
			runKit({
				kitPath,
				brain: 'scripted-optimal',
				seed: 1,
				out: join(root, 'runs'),
				config,
				credentials,
				counterpart: { brain: 'scripted' }
			})
		).rejects.toThrow(/needs a desk/);
	});
});
