import { readFileSync } from 'node:fs';
import { createMemoryStorage } from '@craftabot/core';
import {
	assurancePackFromStorage,
	renderAssurancePackMarkdown
} from '@craftabot/governance/reports';
import { describe, expect, it } from 'vitest';
import { createRegistry } from '$lib/packs.js';
import { describeImport, importBundle } from './bundle-import.js';

/**
 * **A Gate's day, opened** (WP128, `107-THE-GATE.md` §4): the fixture the Gate
 * package holds byte for byte, verified and stored, the Gate stored as the bot
 * it is about, and the assurance pack naming the Gate's mode and stack.
 */
// The workbench's tests run from apps/workbench.
const FIXTURE = '../../packages/gate/fixtures/gate-day.bundle.json';
const GATE_ID = '0a7e0a7e-0000-4000-8000-000000000127';
const NOW = '2026-09-30T12:00:00.000Z';

describe('opening a Gate’s bundle (WP128)', () => {
	it('verifies it, stores its run and the Gate, and says what it opened', async () => {
		const storage = createMemoryStorage();
		const opened = await importBundle(storage, JSON.parse(readFileSync(FIXTURE, 'utf8')), NOW);
		expect(opened).toMatchObject({
			verified: true,
			runs: 1,
			gates: ['example/stack/gated-agent in enforce'],
			agentIds: [GATE_ID]
		});
		expect((await storage.listRuns()).map((run) => run.agentName)).toEqual(['The Gate']);
		expect((await storage.getAgent(GATE_ID))?.spec.name).toBe('The Gate');
		expect(describeImport(opened)).toBe(
			'Opened a bundle of 1 run(s) through the Gate (example/stack/gated-agent in enforce) — digest verified.'
		);
	});

	it('stores a tampered bundle anyway, and says it is unverified', async () => {
		const bundle = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
			runs: Array<{ events: Array<{ payload: { messages?: Array<{ content: string }> } }> }>;
		};
		const composed = bundle.runs[0]!.events.find((event) => event.payload.messages);
		composed!.payload.messages![1]!.content = 'Delete everything.';
		const opened = await importBundle(createMemoryStorage(), bundle, NOW);
		expect(opened.verified).toBe(false);
		expect(describeImport(opened)).toContain('Treat its contents as unverified.');
	});

	it('gives the assurance pack a Gate to be about: its mode, its stack and its conversations', async () => {
		const storage = createMemoryStorage();
		await importBundle(storage, JSON.parse(readFileSync(FIXTURE, 'utf8')), NOW);
		const pack = await assurancePackFromStorage(GATE_ID, storage, createRegistry(), {
			now: () => NOW
		});
		expect(pack.inventory.gates).toEqual([
			{
				stackId: 'example/stack/gated-agent',
				mode: 'enforce',
				upstream: '127.0.0.1',
				runIds: [(await storage.listRuns())[0]!.id]
			}
		]);
		expect(renderAssurancePackMarkdown(pack)).toContain(
			'- Through the Gate: stack `example/stack/gated-agent` in **enforce** mode, in front of `127.0.0.1` — 1 conversation(s)'
		);
	});
});
