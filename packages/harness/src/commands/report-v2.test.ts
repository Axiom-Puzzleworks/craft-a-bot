import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { injectionBaseline, type Campaign } from '@craftabot/evals';
import { createRegistry, defaultConfig } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { createFileStorage } from '../storage/file-storage.js';
import { snackbotKit } from '../testing/kit-fixture.js';
import { runCampaignFile } from './campaign.js';
import { evaluateRun } from './evaluate.js';
import { runKit } from './run.js';
import { reportSafetyCase, reportTelemetry } from './report.js';

/**
 * `craftabot report` after WP49 (`37-…` §4.1–4.2): the telemetry report
 * carries the series and its drift flags, and the safety case quotes the
 * evaluations over the bot's runs and the campaign a build of it ran in —
 * a report the harness files in the store as the Workshop does.
 */
const roots: string[] = [];
afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

const config = defaultConfig();
const credentials = credentialsFromEnv({});

describe('craftabot report (WP49)', () => {
	it('--telemetry carries a one-day series with no drift over a store of two runs', async () => {
		const root = await mkdtemp(join(tmpdir(), 'craftabot-report-v2-'));
		roots.push(root);
		const kitPath = join(root, 'bot.craftabot.json');
		await writeFile(kitPath, JSON.stringify(snackbotKit()), 'utf8');
		const out = join(root, 'runs');
		await runKit({ kitPath, seed: 1, out, config, credentials, brain: 'scripted-optimal' });
		await runKit({ kitPath, seed: 2, out, config, credentials, brain: 'scripted-optimal' });
		const telemetry = await reportTelemetry(await createFileStorage(out));
		expect(telemetry.series).toHaveLength(1);
		expect(telemetry.series[0]).toMatchObject({ runs: 2, finishedRuns: 2 });
		expect(telemetry.drift).toEqual([]);
	});

	it('--safety-case quotes the evaluations over the bot’s runs and the campaign gates its build ran under', async () => {
		const root = await mkdtemp(join(tmpdir(), 'craftabot-report-v2-'));
		roots.push(root);
		const kit = snackbotKit();
		const kitPath = join(root, 'bot.craftabot.json');
		await writeFile(kitPath, JSON.stringify(kit), 'utf8');
		const out = join(root, 'out');
		const runsDir = join(out, 'runs');

		// A run, evaluated.
		const run = await runKit({
			kitPath,
			seed: 1,
			out: runsDir,
			config,
			credentials,
			brain: 'scripted-optimal'
		});
		const storage = await createFileStorage(runsDir);
		const registry = createRegistry(config);
		// Every deterministic evaluator the packs ship, as `craftabot evaluate` runs them by default.
		const evaluated = await evaluateRun(storage, registry, run.runId, { credentials });
		expect(evaluated.records.length).toBeGreaterThan(0);

		// The baseline at one seed, with this bot as a second build.
		const base = injectionBaseline([1]);
		const campaign: Campaign = {
			...base,
			builds: [base.builds[0]!, { id: 'shelf-bot', base: { kind: 'kit', kit } }],
			scenarios: base.scenarios.slice(0, 1),
			guards: base.guards.slice(0, 1),
			brains: base.brains.slice(0, 1),
			gates: [base.gates[0]!]
		};
		const file = join(root, 'campaign.json');
		await writeFile(file, JSON.stringify(campaign), 'utf8');
		const result = await runCampaignFile({ file, out, config, credentials });
		expect(result.report.builds.find((build) => build.id === 'shelf-bot')?.agentId).toBe(
			kit.agent.id
		);

		const worksheet = await reportSafetyCase(storage, registry, kit.agent.id);
		expect(worksheet.evaluations.map((row) => row.evaluatorId).sort()).toEqual(
			[...new Set(evaluated.records.map((record) => record.evaluatorId))].sort()
		);
		const judged = worksheet.evaluations.reduce(
			(total, row) => total + row.pass + row.fail + row.inconclusive + row.noVerdict,
			0
		);
		expect(judged).toBe(evaluated.records.length);
		expect(worksheet.campaigns).toHaveLength(1);
		expect(worksheet.campaigns[0]).toMatchObject({
			reportId: result.report.id,
			buildId: 'shelf-bot',
			cells: 1,
			gates: [{ id: base.gates[0]!.id, scoped: false }]
		});
	});
});
