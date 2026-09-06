import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	brickKindsFor,
	buildKitFile,
	caretRangesFor,
	type EngineEvent,
	type KitFile
} from '@craftabot/core';
import { buildSpec as lendingSpec } from '@craftabot/pack-fs-lending/testing';
import { lendingCardId, LENDING_POLICY_CARD_IDS } from '@craftabot/pack-fs-lending';
import { afterAll, describe, expect, it } from 'vitest';
import { createRegistry, defaultConfig, packVersions } from '../config.js';
import { credentialsFromEnv } from '../credentials.js';
import { createFileStorage } from '../storage/file-storage.js';
import { FIXTURE_CARTRIDGE, snackbotKit } from '../testing/kit-fixture.js';
import { divergenceAfter, forkRun } from './fork.js';
import { runKit } from './run.js';

/**
 * `craftabot fork` (WP66 stage B, `54-…` §4.3, §11 item 3): a fork of a
 * stored run with nothing changed reproduces it and says so; a fork of a
 * declined loan under the Lending Desk's cards checks every decision and
 * decides the same, and the report says the rows diverged but the acts did
 * not; a fork under a build that blocks the decision diverges in what it
 * did, and the report says at which tick.
 */
const roots: string[] = [];
afterAll(async () => {
	for (const root of roots) await rm(root, { recursive: true, force: true });
});
const config = defaultConfig();
const credentials = credentialsFromEnv({});

async function tempRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'craftabot-fork-'));
	roots.push(root);
	return root;
}

function lendingKit(safety?: NonNullable<Parameters<typeof lendingSpec>[0]>['safety']): KitFile {
	const registry = createRegistry(config);
	const spec = lendingSpec({
		goalCardId: lendingCardId('clear-decline'),
		...(safety ? { safety } : {})
	});
	if (spec.bricks.llm) spec.bricks.llm.cartridgeId = FIXTURE_CARTRIDGE;
	return buildKitFile(spec, {
		exportedBy: 'craftabot-harness/fixture',
		exportedAt: '2026-09-06T09:00:00.000Z',
		requires: {
			core: '>=0.0.1',
			packs: caretRangesFor(packVersions(config)),
			brickKinds: brickKindsFor(spec, registry)
		}
	});
}

describe('craftabot fork', () => {
	it('a fork with nothing changed reproduces the origin and says so; its record names the origin', async () => {
		const root = await tempRoot();
		const kitPath = join(root, 'bot.craftabot.json');
		await writeFile(kitPath, JSON.stringify(snackbotKit('starter/snack')), 'utf8');
		const out = join(root, 'runs');
		const origin = await runKit({
			kitPath,
			seed: 1,
			out,
			config,
			credentials,
			brain: 'scripted-optimal'
		});
		expect(origin.ticks).toBeGreaterThan(2);

		const fork = await forkRun({
			runId: origin.runId,
			tick: 1,
			brain: 'scripted-optimal',
			seed: 1,
			out,
			config,
			credentials
		});
		expect(fork.forkedFrom).toEqual({ runId: origin.runId, tick: 1 });
		expect(fork.outcome).toBe(origin.outcome);
		expect(fork.divergence).toEqual({ diverged: false });
		expect(fork.acts).toEqual({ same: true });
		expect(fork.runId).not.toBe(origin.runId);

		const storage = await createFileStorage(out);
		const record = await storage.getRun(fork.runId);
		expect(record?.forkedFrom).toEqual({ runId: origin.runId, tick: 1 });
		const started = (await storage.getEvents(fork.runId)).map((row) => row.event)[0];
		expect(started?.type === 'run.started' && started.payload.forkedFrom).toMatchObject({
			runId: origin.runId,
			tick: 1
		});
		const trace = JSON.parse(await readFile(fork.traceFile, 'utf8')) as {
			run: { forkedFrom?: unknown };
		};
		expect(trace.run.forkedFrom).toEqual({ runId: origin.runId, tick: 1 });
		// The default tick is the origin's last completed tick but one.
		const later = await forkRun({
			runId: origin.runId,
			brain: 'scripted-optimal',
			seed: 1,
			out,
			config,
			credentials
		});
		expect(later.forkedFrom.tick).toBe(origin.ticks - 1);
	});

	it('a declined loan forked under the Lending Desk’s cards decides the same — rows diverge, acts do not — and under a block it does not', async () => {
		const root = await tempRoot();
		const plain = join(root, 'plain.craftabot.json');
		await writeFile(plain, JSON.stringify(lendingKit()), 'utf8');
		const guarded = join(root, 'guarded.craftabot.json');
		await writeFile(
			guarded,
			JSON.stringify(
				lendingKit({
					maxTicks: 20,
					blockedActions: [],
					approvalMode: false,
					policyCards: [...LENDING_POLICY_CARD_IDS]
				})
			),
			'utf8'
		);
		const blocking = join(root, 'blocking.craftabot.json');
		await writeFile(
			blocking,
			JSON.stringify(
				lendingKit({
					maxTicks: 20,
					blockedActions: ['decide'],
					approvalMode: false,
					policyCards: []
				})
			),
			'utf8'
		);
		const out = join(root, 'runs');
		const origin = await runKit({
			kitPath: plain,
			seed: 1,
			out,
			config,
			credentials,
			brain: 'scripted-optimal'
		});
		expect(origin.outcome).toBe('SUCCESS');

		const same = await forkRun({
			runId: origin.runId,
			tick: 2,
			kitPath: guarded,
			brain: 'scripted-optimal',
			seed: 1,
			out,
			config,
			credentials
		});
		expect(same.outcome).toBe('SUCCESS');
		expect(same.divergence).toMatchObject({ diverged: true, atTick: 3 });
		expect(same.acts).toEqual({ same: true });

		const different = await forkRun({
			runId: origin.runId,
			tick: 2,
			kitPath: blocking,
			brain: 'scripted-optimal',
			seed: 1,
			out,
			config,
			credentials
		});
		expect(different.acts).toMatchObject({ same: false, atTick: 3 });
		expect(different.outcome).not.toBe('SUCCESS');
	});

	it('a divergence is about what the bot did, not who was behind it (WP65): attestations and bys are left out', () => {
		const base = {
			id: 'e',
			runId: 'r',
			tick: 2,
			timestamp: '2026-09-06T09:00:00.000Z'
		};
		const acted = (principal: { kind: 'person' | 'service'; id: string }): EngineEvent =>
			({
				...base,
				type: 'action.performed',
				payload: {
					name: 'move',
					arguments: {},
					result: { ok: true, narration: 'ok', stateDiff: [] },
					attestation: { principal, guardrailsPassed: [] }
				}
			}) as EngineEvent;
		const answered = (by?: { kind: 'person'; id: string }): EngineEvent =>
			({
				...base,
				type: 'approval.resolved',
				payload: { approved: true, ...(by ? { by } : {}) }
			}) as EngineEvent;
		expect(
			divergenceAfter(
				[answered({ kind: 'person', id: 'p' }), acted({ kind: 'person', id: 'p' })],
				[answered(), acted({ kind: 'service', id: 'craftabot-harness' })],
				1
			)
		).toEqual({ diverged: false });
	});

	it('refuses a run it does not hold and a tick the origin never completed', async () => {
		const root = await tempRoot();
		const kitPath = join(root, 'bot.craftabot.json');
		await writeFile(kitPath, JSON.stringify(snackbotKit()), 'utf8');
		const out = join(root, 'runs');
		const origin = await runKit({
			kitPath,
			seed: 1,
			out,
			config,
			credentials,
			brain: 'scripted-optimal'
		});
		await expect(
			forkRun({ runId: 'nobody', brain: 'scripted-optimal', seed: 1, out, config, credentials })
		).rejects.toThrow(/no run 'nobody'/);
		await expect(
			forkRun({
				runId: origin.runId,
				tick: 99,
				brain: 'scripted-optimal',
				seed: 1,
				out,
				config,
				credentials
			})
		).rejects.toThrow(/--tick 99/);
	});
});
