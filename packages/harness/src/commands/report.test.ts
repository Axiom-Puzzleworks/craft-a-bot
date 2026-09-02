import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { capabilitiesOf } from '@craftabot/core';
import { ensureRunSummaries, safetyCaseFromSummaries } from '@craftabot/governance/reports';
import { createRegistry, defaultConfig } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { createFileStorage } from '../storage/file-storage.js';
import { snackbotKit } from '../testing/kit-fixture.js';
import { runKit } from './run.js';
import { reportIncidents, reportSafetyCase, reportTelemetry } from './report.js';

const roots: string[] = [];
afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});

const config = defaultConfig();
const credentials = credentialsFromEnv({});

async function storeWithRuns() {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-report-'));
	roots.push(root);
	const kitPath = join(root, 'bot.craftabot.json');
	await writeFile(kitPath, JSON.stringify(snackbotKit()), 'utf8');
	const out = join(root, 'runs');
	const base = { kitPath, seed: 1, out, config, credentials } as const;
	const ok = await runKit({ ...base, brain: 'scripted-optimal' });
	// A denied approval never happens without a Safety Brick; a failed action
	// does with the noisy brain — a real incident, made by a real run.
	const noisy = await runKit({ ...base, brain: 'scripted-noisy', seed: 5, card: 'starter/snack' });
	return { out, ok, noisy, storage: await createFileStorage(out) };
}

describe('craftabot report', () => {
	it('--safety-case emits exactly what the Workshop’s screen renders for the same bot', async () => {
		const { storage, ok } = await storeWithRuns();
		const registry = createRegistry(config);

		// What `/workshop/safety-case` does, with the same inputs from the same store.
		const record = (await storage.getAgent(ok.agentId))!;
		const mine = (await storage.listRuns()).filter((run) => run.agentId === record.id);
		const screen = safetyCaseFromSummaries(
			{ id: record.id, name: record.spec.name, goalCardId: record.spec.goalCardId },
			capabilitiesOf(record.spec, registry),
			registry.getWorld(registry.getGoalCard(record.spec.goalCardId)?.worldId ?? ''),
			registry.listTools(),
			mine,
			await ensureRunSummaries(storage, mine)
		);

		const report = await reportSafetyCase(storage, registry, ok.agentId);
		expect(report).toEqual(screen);
		expect(report.trustworthiness.runs).toBe(2);
		expect(report.trustworthiness.finishedRuns).toBe(2);
		// The fixture kit fits no Safety Brick, so the control argument is honestly empty.
		expect(report.guardrails).toEqual([]);

		// The only bot in the store needs no id.
		expect(await reportSafetyCase(storage, registry)).toEqual(screen);
		await expect(reportSafetyCase(storage, registry, 'nobody')).rejects.toThrow(/no bot 'nobody'/);
	});

	it('--incidents lists the runs that went wrong, newest first, from stored summaries', async () => {
		const { storage, noisy } = await storeWithRuns();
		const incidents = await reportIncidents(storage);
		for (const incident of incidents) expect(incident.findings.length).toBeGreaterThan(0);
		// Every finding came from a summary row the run wrote when it finished.
		expect(await storage.getRunSummary(noisy.runId)).toBeDefined();
		expect(incidents.map((i) => i.runId)).toEqual(
			(await storage.listRuns())
				.filter((r) => incidents.some((i) => i.runId === r.id))
				.map((r) => r.id)
		);
	});

	it('--telemetry breaks the store down by card, cartridge, guardrail and autonomy', async () => {
		const { storage } = await storeWithRuns();
		const telemetry = await reportTelemetry(storage);
		expect(telemetry.byCard.map((row) => row.goalCardId).sort()).toEqual([
			'starter/say-hello',
			'starter/snack'
		]);
		expect(telemetry.byCartridge.map((row) => row.providerId).sort()).toEqual([
			'scripted-noisy',
			'scripted-optimal'
		]);
		expect(telemetry.autonomy.runs).toBe(2);
		expect(Array.isArray(telemetry.guardrailMix)).toBe(true);
	});

	it('asks which bot when the store holds several and none is named', async () => {
		const { storage } = await storeWithRuns();
		const registry = createRegistry(config);
		const second = {
			...(await storage.listAgents())[0]!,
			id: '22222222-2222-4222-8222-222222222222'
		};
		await storage.putAgent({ ...second, spec: { ...second.spec, id: second.id } });
		await expect(reportSafetyCase(storage, registry)).rejects.toThrow(/which bot/);
	});
});
