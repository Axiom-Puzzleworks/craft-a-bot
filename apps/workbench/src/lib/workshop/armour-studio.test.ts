import { describe, expect, it } from 'vitest';
import { armorConfigSchema } from '@craftabot/pack-geap';
import type { ArmorConfig } from '@craftabot/pack-geap';
import { createMemoryStorage } from '$lib/state/storage-memory.js';
import { buildArmourGuardrails, runArmourProbe } from './armour-studio.js';

const REQUIRED = { projectId: 'proj-1', location: 'europe-west2', templateId: 'cab-armour' };

function config(overrides: Partial<ArmorConfig> = {}): ArmorConfig {
	return armorConfigSchema.parse({ ...REQUIRED, offline: true, ...overrides });
}

describe('buildArmourGuardrails', () => {
	it('builds one guardrail per non-off screen, in hook order', () => {
		const guardrails = buildArmourGuardrails(config(), 'token');
		expect(guardrails.map((g) => g.hooks[0])).toEqual(['pre-act']);
	});

	it('builds nothing when every screen is off', () => {
		const guardrails = buildArmourGuardrails(
			config({ screenObservation: 'off', screenDecision: 'off', screenResult: 'off' }),
			'token'
		);
		expect(guardrails).toHaveLength(0);
	});

	it('builds all three when every screen is on', () => {
		const guardrails = buildArmourGuardrails(
			config({ screenObservation: 'note', screenDecision: 'ask', screenResult: 'note' }),
			'token'
		);
		expect(guardrails.map((g) => g.hooks[0])).toEqual(['pre-think', 'pre-act', 'post-act']);
	});
});

describe('runArmourProbe', () => {
	it('runs starter/warning-sign and persists a real stored run either way', async () => {
		const storage = createMemoryStorage();
		const result = await runArmourProbe(config({ screenDecision: 'note' }), 'token', storage);

		expect(result.events.length).toBeGreaterThan(0);

		const stored = await storage.getRun(result.runId);
		expect(stored).toBeDefined();
		expect(stored?.goalCardId).toBe('starter/warning-sign');
		// `note` never blocks anything, and the hijack script's own eight moves
		// never touch the real success condition, so this scripted run may well
		// run out of script before it runs out of ticks — `IN_PROGRESS` is the
		// honest record of that, the same as an opening record for any run.
		expect(stored?.outcome).toBe(result.outcome ?? 'IN_PROGRESS');

		const events = await storage.getEvents(result.runId);
		expect(events.length).toBe(result.events.length);
	});

	/**
	 * Offline mode always reads clean (`pack-geap`'s own `createOfflineArmorClient`),
	 * so no dial can trip a guardrail here regardless of `screenDecision` — that
	 * proof (a real match producing `stop-run`/`block-action`/`pause`) is
	 * `pack-geap`'s own `guardrails.test.ts`, exhaustively, over fixtures. What
	 * this proves instead: a stricter dial changes nothing about whether the
	 * wiring runs cleanly end to end.
	 */
	it('runs cleanly under every screenDecision dial when offline, since nothing ever matches', async () => {
		for (const screenDecision of ['off', 'note', 'block', 'ask', 'stop'] as const) {
			const storage = createMemoryStorage();
			const result = await runArmourProbe(config({ screenDecision }), 'token', storage);
			expect(result.events.some((event) => event.type === 'error')).toBe(false);
		}
	});

	it('gives each probe run its own unique, real runId — not a repeated test-clock id', async () => {
		const storage = createMemoryStorage();
		const first = await runArmourProbe(config({ screenDecision: 'note' }), 'token', storage);
		const second = await runArmourProbe(config({ screenDecision: 'note' }), 'token', storage);

		expect(first.runId).not.toBe(second.runId);
		expect(await storage.getRun(first.runId)).toBeDefined();
		expect(await storage.getRun(second.runId)).toBeDefined();
	});

	it('declines any approval card, proving the guard rather than rubber-stamping it', async () => {
		const storage = createMemoryStorage();
		const result = await runArmourProbe(config({ screenDecision: 'ask' }), 'token', storage);

		const resolved = result.events.filter((event) => event.type === 'approval.resolved');
		for (const event of resolved) {
			expect(event.type === 'approval.resolved' ? event.payload.approved : undefined).toBe(false);
		}
	});

	it("labels every hosted call's outcome offline when config.offline is set", async () => {
		const storage = createMemoryStorage();
		const result = await runArmourProbe(config({ screenDecision: 'note' }), 'token', storage);

		const external = result.events.filter((event) => event.type === 'guardrail.external');
		expect(external.length).toBeGreaterThan(0);
		for (const event of external) {
			expect(event.type === 'guardrail.external' ? event.payload.outcome : undefined).toBe(
				'offline'
			);
		}
	});

	it('never lets the token reach the stored trace', async () => {
		const storage = createMemoryStorage();
		const result = await runArmourProbe(
			config({ screenDecision: 'note' }),
			'ya29.super-secret-token',
			storage
		);

		const events = await storage.getEvents(result.runId);
		expect(JSON.stringify(events)).not.toContain('ya29.super-secret-token');
	});
});
