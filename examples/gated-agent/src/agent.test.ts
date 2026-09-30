import { readFileSync } from 'node:fs';
import { createPackRegistry, verifyBundleDigest } from '@craftabot/core';
import { GATE_CONTENT, createGate, parseStackFile, serveGate } from '@craftabot/gate';
import starterPack from '@craftabot/pack-starter';
import { describe, expect, it } from 'vitest';
import { runGatedAgent } from './agent.js';
import { startScriptedModel } from './model.js';

/**
 * **The gated example** (WP128): an agent with no Craft A Bot in it, a
 * scripted model, and between them the Gate running `stack.json` — the
 * agent's four outcomes (called, refused by the policy card, refused by the
 * blocklist, stopped by the budget), and the day as a bundle whose digest
 * verifies.
 */
describe('the gated agent', () => {
	it('imports nothing from Craft A Bot', () => {
		for (const file of ['agent.ts', 'model.ts', 'main.ts', 'model-main.ts'])
			expect(readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'), file).not.toMatch(
				/@craftabot/
			);
	});

	it('meets the four outcomes through the Gate, and the day verifies as a bundle', async () => {
		const model = await startScriptedModel();
		const registry = createPackRegistry();
		registry.registerPack(starterPack);
		registry.registerPack(GATE_CONTENT);
		const stack = parseStackFile(
			JSON.parse(readFileSync(new URL('../stack.json', import.meta.url), 'utf8'))
		);
		const gate = createGate({ stack, registry, upstream: { baseUrl: model.url }, mode: 'enforce' });
		const served = await serveGate(gate);
		try {
			const turns = await runGatedAgent({
				baseUrl: `${served.url}/v1`,
				turns: 8,
				conversationId: 'office'
			});
			expect(turns.map((turn) => [turn.turn, turn.outcome])).toEqual([
				[1, 'called'],
				[2, 'called'],
				[3, 'refused'],
				[4, 'refused'],
				[5, 'called'],
				[6, 'stopped']
			]);
			expect(turns[1]!.detail).toBe('send_email: sent to sam@example.com');
			expect(turns[2]!.detail).toContain(
				'The Gate refused send_email: Mail may only be sent to example.com addresses.'
			);
			expect(turns[3]!.detail).toContain('The Gate refused delete_file');
			const bundle = await gate.bundle();
			expect(bundle.runs).toHaveLength(1);
			expect(
				bundle.runs[0]!.events.find((event) => event.type === 'run.started')?.payload
			).toMatchObject({
				gate: { mode: 'enforce', stackId: 'example/stack/gated-agent', upstream: '127.0.0.1' }
			});
			expect(await verifyBundleDigest(bundle)).toBe(true);
		} finally {
			await served.close();
			await model.close();
		}
	});
});
