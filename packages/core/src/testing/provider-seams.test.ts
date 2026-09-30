import { describe, expect, it } from 'vitest';
import { promptDigest } from '../schemas/provider-cassette.js';
import { chatResponseSchema } from '../schemas/shared.js';
import { createMockProvider } from './mock-provider.js';

/**
 * **The provider seams a reader asks through** (WP120, `104-READERS.md`
 * §10.2): a constrained or log-probability request is another prompt to a
 * cassette, while every earlier request digests as it did; the mock says
 * what it supports, and returns log-probabilities only when asked.
 */
const base = {
	model: 'm',
	messages: [{ role: 'user' as const, content: 'hi' }],
	temperature: 0,
	maxTokens: 16
};

describe('the provider seams (WP120)', () => {
	it('digests a constrained request apart, and a plain one as before', () => {
		expect(promptDigest(base)).toBe(promptDigest({ ...base, tools: [] }));
		expect(promptDigest({ ...base, choice: ['a', 'b'] })).not.toBe(promptDigest(base));
		expect(promptDigest({ ...base, topLogprobs: 5 })).not.toBe(promptDigest(base));
	});

	it('the mock declares what it supports and returns log-probabilities only when asked', async () => {
		const logprobs = [{ token: 'a', logprob: -0.1 }];
		const provider = createMockProvider({
			supports: { choice: true, logprobs: true },
			script: () => ({ text: 'a', toolCall: null, logprobs })
		});
		expect(provider.supports).toEqual({ choice: true, logprobs: true });
		const signal = new AbortController().signal;
		const asked = await provider.chat({ ...base, topLogprobs: 20 }, { signal });
		expect(asked.logprobs).toEqual(logprobs);
		expect(chatResponseSchema.safeParse(asked).success).toBe(true);
		expect((await provider.chat(base, { signal })).logprobs).toBeUndefined();
		expect(createMockProvider({ script: [] }).supports).toBeUndefined();
	});
});
