import { describe, expect, it } from 'vitest';
import type { ChatResponse, GuardrailService, ScreenRequest } from '@craftabot/core';
import { createHostedGuardrails } from './hosted/guardrails.js';
import { hostedScreenConfigSchema } from './hosted/config.js';
import { pdpInputSchema, pdpRequestFor } from './pdp.js';
import { action, context } from './test-context.js';

describe('pdpRequestFor (WP45)', () => {
	it('is spec identity, the proposed call, usage and every world predicate answered now', () => {
		const ctx = {
			...context({
				hook: 'pre-act',
				tick: 4,
				proposed: action('say', { text: 'hi' }),
				usage: { ticks: 4, inputTokens: 10, outputTokens: 5 }
			}),
			world: {
				test: (id: string) => id === 'chest-open',
				predicates: ['chest-open', 'blocks-in-chest']
			}
		};
		const input = pdpRequestFor(ctx);
		expect(input).toEqual({
			version: 1,
			hook: 'pre-act',
			tick: 4,
			agent: { id: ctx.spec.id, name: ctx.spec.name, goalCardId: ctx.spec.goalCardId },
			proposed: { kind: 'action', name: 'say', arguments: { text: 'hi' } },
			usage: { ticks: 4, inputTokens: 10, outputTokens: 5 },
			world: { predicates: { 'chest-open': true, 'blocks-in-chest': false } }
		});
		expect(pdpInputSchema.safeParse(input).success).toBe(true);
	});

	it('without a proposal or a world it still says who and how much', () => {
		const input = pdpRequestFor(context({ hook: 'pre-think' }));
		expect(input.proposed).toBeUndefined();
		expect(input.world).toEqual({ predicates: {} });
		expect(pdpInputSchema.safeParse(input).success).toBe(true);
	});

	it('the shell attaches it to every screen request', async () => {
		const seen: ScreenRequest[] = [];
		const [guardrail] = createHostedGuardrails({
			service: {
				id: 'test/pdp',
				name: 'PDP',
				description: 'records what it is asked',
				hooks: ['pre-act'],
				egress: [],
				configSchema: hostedScreenConfigSchema,
				create: () => ({
					screen: (request) => {
						seen.push(request);
						return Promise.resolve({
							reading: { outcome: 'ok', matched: false, findings: [] },
							record: { service: 'test', endpoint: 'nowhere' }
						});
					}
				}),
				createOffline: () => {
					throw new Error('not offline');
				}
			} as GuardrailService,
			idPrefix: 'test/pdp',
			serviceConfig: {},
			screening: hostedScreenConfigSchema.parse({ screenDecision: 'stop' }),
			ctx: { fetch: () => Promise.reject(new Error('no network')), getCredential: () => undefined },
			envelope: () => ({ agentId: 'a', tick: 1 })
		});
		await guardrail?.check({
			...context({ hook: 'pre-act', proposed: action('say', { text: 'hi' }) }),
			response: { text: 'I will say hi', raw: {}, finishReason: 'stop' } as ChatResponse
		});
		expect(seen).toHaveLength(1);
		expect(pdpInputSchema.safeParse(seen[0]?.policyInput).success).toBe(true);
		expect((seen[0]?.policyInput as { proposed?: { name: string } }).proposed?.name).toBe('say');
	});
});
