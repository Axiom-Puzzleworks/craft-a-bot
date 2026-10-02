import { describe, expect, it } from 'vitest';
import { failoverProvider } from './failover.js';
import type { ChatRequest, LLMProvider } from './types/provider.js';

/**
 * WP148 (`110-CONTROL-SUITE-PLAN.md` §10): failover asks each provider in
 * turn on a failure that warrants it, says who served and who failed, and
 * leaves any other failure — and a cancelled call — to the caller.
 */
const down = (id: string, kind = 'unavailable'): LLMProvider => ({
	id,
	name: id,
	keyRequirement: 'none',
	egress: [{ host: `${id}.example`, purpose: 'chat', sends: ['observation'] }],
	validateKey: () => Promise.resolve({ ok: true, message: 'fine' }),
	chat: () => Promise.reject(Object.assign(new Error(`${id} is ${kind}`), { kind }))
});
const working = (id: string): LLMProvider => ({
	...down(id),
	chat: () =>
		Promise.resolve({
			text: 'hello',
			toolCall: null,
			usage: { inputTokens: 1, outputTokens: 1 },
			raw: {},
			finishReason: 'stop'
		})
});
const request: ChatRequest = {
	model: 'm',
	messages: [{ role: 'user', content: 'hi' }],
	temperature: 0,
	maxTokens: 16
};
const opts = () => ({ signal: new AbortController().signal });

describe('failoverProvider (WP148)', () => {
	it('answers from the next provider when the first is down, and says so', async () => {
		const up = working('backup');
		const provider = failoverProvider([down('primary'), up]);
		expect(provider.id).toBe(`failover:primary+${up.id}`);
		expect(provider.egress?.map((entry) => entry.host)).toContain('primary.example');
		const response = await provider.chat(request, opts());
		expect(response.servedBy).toEqual({
			providerId: up.id,
			failedOver: [{ providerId: 'primary', kind: 'unavailable' }]
		});
		expect((await provider.validateKey('k')).ok).toBe(true);
	});

	it('passes a failure that does not warrant failover straight back, and the last one when all fail', async () => {
		const up = working('backup');
		await expect(
			failoverProvider([down('bad', 'bad-request'), up]).chat(request, opts())
		).rejects.toThrow('bad is bad-request');
		await expect(
			failoverProvider([down('a'), down('b', 'timeout')]).chat(request, opts())
		).rejects.toThrow('b is timeout');
		await expect(
			failoverProvider([down('a')], { id: 'mine', kinds: ['nothing'] }).chat(request, opts())
		).rejects.toThrow('a is unavailable');
		await expect(
			failoverProvider([
				Object.assign(down('a'), { chat: () => Promise.reject(new Error('plain')) })
			]).chat(request, opts())
		).rejects.toThrow('plain');
	});

	it('does not fail over a cancelled call, and refuses an empty list', async () => {
		const controller = new AbortController();
		controller.abort();
		const up = working('backup');
		await expect(
			failoverProvider([down('a'), up]).chat(request, { signal: controller.signal })
		).rejects.toThrow('a is unavailable');
		expect(() => failoverProvider([])).toThrow(/at least one/);
	});
});
