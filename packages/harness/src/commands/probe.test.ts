import { describe, expect, it } from 'vitest';
import type { ChatRequest, LLMProvider } from '@craftabot/core';
import { mulberry32 } from '@craftabot/metrics';
import { probeArms, probeDeterminism, renderProbe } from './probe.js';

/**
 * **The determinism probe** (WP192, `113-RECORDING-AND-RELIABILITY.md` §4.8),
 * over stub providers with a repeat rate it is built with: the report must
 * read the rate it was given, a seed that fixes an answer must read as fixing
 * it, and two configurations that answer alike must read as agreeing.
 */
const requests: ChatRequest[] = Array.from({ length: 8 }, (_, i) => ({
	model: 'm',
	messages: [{ role: 'user' as const, content: `prompt ${i}` }],
	temperature: 0,
	maxTokens: 64
}));

/**
 * A provider whose answer to a prompt is the canonical one with chance `repeat` (when no seed is sent), else a
 * variant of its own; a seeded request is answered by a fixed function of the seed and the prompt, as a server that
 * honours seeds does.
 */
function stub(repeat: number, seedHonoured = true, failEvery = 0): LLMProvider {
	const random = mulberry32(99);
	let calls = 0;
	return {
		id: 'stub',
		name: 'stub',
		keyRequirement: 'none',
		egress: [],
		validateKey: () => Promise.resolve({ ok: true, message: '' }),
		async chat(request) {
			calls += 1;
			if (failEvery > 0 && calls % failEvery === 0) throw new Error('timed out');
			const prompt = request.messages[0]!.content;
			const canonical = `I will look at ${prompt} and decide what to do about it.`;
			let text = canonical;
			if (request.seed !== undefined && seedHonoured) text = canonical;
			else if (random() >= repeat)
				text = `${canonical.slice(0, 10 + Math.floor(random() * 20))} — another way ${Math.floor(random() * 1000)}`;
			return {
				text,
				toolCall: { name: text === canonical ? 'say' : 'wait', arguments: { prompt } },
				usage: { inputTokens: 10, outputTokens: text.length },
				raw: null,
				finishReason: 'tool_call' as const
			};
		}
	};
}

describe('probeDeterminism (WP192)', () => {
	it('reads the repeat rate it was built with, and a seed that is honoured as an answer fixed', async () => {
		const report = await probeDeterminism({
			requests,
			configs: [
				{ id: 'steady', provider: stub(1) },
				{ id: 'noisy', provider: stub(0.5) }
			],
			arms: probeArms(0.7),
			repeat: 6
		});
		const row = (config: string, arm: string) =>
			report.rows.find((held) => held.config === config && held.arm === arm)!;
		expect(report.prompts).toBe(8);
		expect(row('steady', 'temperature-0').sameText.value).toBe(1);
		expect(row('steady', 'temperature-0').meanFirstDifferingChar).toBeNull();
		// A pair of answers matches only when both are canonical (0.25) or the same variant (rare): well under the steady unit.
		const noisy = row('noisy', 'temperature-0');
		expect(noisy.sameText.value).toBeGreaterThan(0.15);
		expect(noisy.sameText.value).toBeLessThan(0.45);
		expect(noisy.sameCall.value).toBeGreaterThan(0.15);
		expect(noisy.meanFirstDifferingChar).toBeGreaterThan(5);
		// A seed this server honours fixes the answer: the seeded arms read 1, on the noisy unit too.
		expect(row('noisy', 'temperature-0-seed').sameText.value).toBe(1);
		expect(row('noisy', 'temperature-0.7-seed').sameText.value).toBe(1);
		// Intervals are over the prompts.
		expect(noisy.sameText.interval[0]).toBeLessThanOrEqual(noisy.sameText.value);
		expect(noisy.sameText.interval[1]).toBeGreaterThanOrEqual(noisy.sameText.value);
	});

	it('reads a seed that is not honoured as no help, and two configurations alike as agreeing', async () => {
		const report = await probeDeterminism({
			requests,
			configs: [
				{ id: 'a', provider: stub(0.5, false) },
				{ id: 'b', provider: stub(0.5, false) }
			],
			arms: [{ id: 'seeded', temperature: 0, seed: 1 }],
			repeat: 6
		});
		const a = report.rows.find((held) => held.config === 'a')!;
		expect(a.sameText.value).toBeLessThan(0.45);
		// Between two units that answer alike: a, b each match the other as often as each matches itself.
		expect(report.cross).toHaveLength(1);
		expect(report.cross[0]).toMatchObject({ a: 'a', b: 'b', arm: 'seeded' });
		expect(report.cross[0]!.sameText.value).toBeGreaterThan(0.15);
		expect(report.cross[0]!.sameText.value).toBeLessThan(0.45);
	});

	it('counts the requests that failed and reads the answers that came', async () => {
		const report = await probeDeterminism({
			requests,
			configs: [{ id: 'flaky', provider: stub(1, true, 3) }],
			arms: [{ id: 'temperature-0', temperature: 0 }],
			repeat: 3
		});
		// 8 prompts × 3 repeats = 24 calls, every third fails.
		expect(report.rows[0]!.failed).toBe(8);
		expect(report.rows[0]!.sameText.value).toBe(1);
	});

	it('refuses to read repeating from one answer, and renders as the table the report is shown as', async () => {
		await expect(
			probeDeterminism({
				requests,
				configs: [{ id: 'x', provider: stub(1) }],
				arms: probeArms(),
				repeat: 1
			})
		).rejects.toThrow(/at least 2/);
		const report = await probeDeterminism({
			requests: requests.slice(0, 2),
			configs: [
				{ id: 'x', provider: stub(1) },
				{ id: 'y', provider: stub(1) }
			],
			arms: probeArms(),
			repeat: 2
		});
		const text = renderProbe(report);
		expect(text).toContain('| Configuration | Arm | Same text');
		expect(text).toContain('| x and y | temperature-0 |');
		expect(text).toContain('2 prompts, each sent 2 times');
	});
});
