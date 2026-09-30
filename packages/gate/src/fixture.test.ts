import { readFileSync, writeFileSync } from 'node:fs';
import { createPackRegistry, stackSchema, verifyBundleDigest } from '@craftabot/core';
import starterPack from '@craftabot/pack-starter';
import { describe, expect, it } from 'vitest';
import { createGate } from './gate.js';
import { GATE_CONTENT } from './presets.js';

/**
 * **A Gate's day, as a fixture** (WP128, `107-THE-GATE.md` §4): one
 * conversation through a stack like the gated example's — two calls
 * forwarded, one refused by the policy card, one by the blocklist, a stop at
 * the budget — built with a fixed clock and fixed ids, its bundle held byte
 * for byte at `fixtures/gate-day.bundle.json`. The Workbench opens that file
 * in the Audit Centre and reads it in the assurance pack. `UPDATE_GATE_FIXTURE=1`
 * rewrites it.
 */
const FIXTURE = new URL('../fixtures/gate-day.bundle.json', import.meta.url);
const SCRIPT = [
	{ name: 'read_file', arguments: { path: 'notes/today.md' } },
	{ name: 'send_email', arguments: { to: 'sam@example.com', text: 'See attached.' } },
	{ name: 'send_email', arguments: { to: 'someone@elsewhere.test', text: 'See attached.' } },
	{ name: 'delete_file', arguments: { path: 'notes/today.md' } },
	{ name: 'read_file', arguments: { path: 'notes/tomorrow.md' } }
];

async function gateDay() {
	const registry = createPackRegistry();
	registry.registerPack(starterPack);
	registry.registerPack(GATE_CONTENT);
	const stack = stackSchema.parse({
		schemaVersion: 1,
		id: 'example/stack/gated-agent',
		name: 'The gated agent’s stack',
		description: 'A turn budget, no deleting files, and mail only inside example.com.',
		fit: [
			{
				componentId: 'governance/step-budget',
				config: { maxTicks: 6 },
				point: { kind: 'pre-think' }
			},
			{
				componentId: 'governance/action-blocklist',
				config: { blockedActions: ['delete_file'] },
				point: { kind: 'pre-act' }
			},
			{
				componentId: 'governance/policy-card',
				config: { cardId: 'gate/policy/no-outside-mail' },
				point: { kind: 'pre-act' }
			}
		],
		provenance: {
			author: { kind: 'service', id: 'example/gated-agent' },
			createdAt: '2026-09-30T00:00:00.000Z'
		}
	});
	let turn = 0;
	const fetch = (async () => {
		const call = SCRIPT[turn];
		turn += 1;
		return new Response(
			JSON.stringify({
				id: `scripted-${turn}`,
				choices: [
					{
						index: 0,
						message: {
							role: 'assistant',
							content: call ? `I will ${call.name}.` : 'Done.',
							...(call
								? {
										tool_calls: [
											{
												id: `call_${turn}`,
												type: 'function',
												function: { name: call.name, arguments: JSON.stringify(call.arguments) }
											}
										]
									}
								: {})
						},
						finish_reason: call ? 'tool_calls' : 'stop'
					}
				],
				usage: { prompt_tokens: 120, completion_tokens: 12 }
			}),
			{ status: 200 }
		);
	}) as typeof globalThis.fetch;
	let second = 0;
	let id = 0;
	const gate = createGate({
		stack,
		registry,
		upstream: { baseUrl: 'http://127.0.0.1:8128/v1' },
		mode: 'enforce',
		fetch,
		principal: { kind: 'service', id: 'example/office-assistant', name: 'The office assistant' },
		now: () => new Date(Date.UTC(2026, 8, 30, 9, 0, second++)).toISOString(),
		newId: () => `6a7e0000-0000-4000-8000-${String(++id).padStart(12, '0')}`
	});
	const messages: unknown[] = [
		{ role: 'system', content: 'You are an office assistant.' },
		{ role: 'user', content: 'Tidy up my notes and tell Sam.' }
	];
	for (let step = 0; step < 6; step += 1) {
		const reply = await gate.handle(
			{ model: 'office-model', messages },
			{ 'x-craftabot-conversation': 'office' }
		);
		const message = (
			reply.body as {
				choices: Array<{
					message: {
						content: string;
						tool_calls?: Array<{ id: string; function: { name: string } }>;
					};
				}>;
			}
		).choices[0]!.message;
		messages.push({
			role: 'assistant',
			content: message.content,
			...(message.tool_calls ? { tool_calls: message.tool_calls } : {})
		});
		for (const call of message.tool_calls ?? [])
			messages.push({ role: 'tool', tool_call_id: call.id, content: `${call.function.name} done` });
		if (!message.tool_calls) messages.push({ role: 'user', content: 'Carry on.' });
	}
	await gate.end('office');
	return gate.bundle('craftabot/gate (fixture)');
}

describe('a Gate’s day (WP128)', () => {
	it('is held byte for byte, and its digest verifies', async () => {
		const bundle = await gateDay();
		const text = `${JSON.stringify(bundle, null, '\t')}\n`;
		if (process.env['UPDATE_GATE_FIXTURE'] === '1') writeFileSync(FIXTURE, text);
		expect(text).toBe(readFileSync(FIXTURE, 'utf8'));
		expect(await verifyBundleDigest(bundle)).toBe(true);
		const started = bundle.runs[0]!.events.find((event) => event.type === 'run.started');
		expect(started?.payload).toMatchObject({
			gate: { mode: 'enforce', stackId: 'example/stack/gated-agent', upstream: '127.0.0.1' },
			principal: { id: 'example/office-assistant' }
		});
		const tripped = bundle.runs[0]!.events.filter(
			(event) => event.type === 'guardrail.tripped'
		).map((event) => (event.type === 'guardrail.tripped' ? event.payload.guardrailId : ''));
		expect(tripped).toEqual([
			'gate/policy/no-outside-mail#rule-0',
			'safety/action-blocklist',
			'safety/step-budget'
		]);
	});
});
