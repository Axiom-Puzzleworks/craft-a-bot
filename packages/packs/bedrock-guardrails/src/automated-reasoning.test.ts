import { describe, expect, it } from 'vitest';
import { automatedReasoningReading, automatedReasoningService } from './automated-reasoning.js';
import { fixtures } from './fixtures/index.js';
import { applyGuardrailResponseSchema } from './service.js';

/** WP144 (`110-CONTROL-SUITE-PLAN.md` §10): a contradicted claim is a violation; one the checker could not judge is never an allow. */
const read = (name: keyof typeof fixtures) =>
	automatedReasoningReading(applyGuardrailResponseSchema.parse(fixtures[name]));

describe('Bedrock automated-reasoning checks (WP144)', () => {
	it('reads a proved claim as clean and a contradicted one as a violation', () => {
		expect(read('ar-valid')).toMatchObject({ outcome: 'ok', matched: false });
		expect(read('ar-invalid')).toMatchObject({
			outcome: 'ok',
			matched: true,
			findings: [{ category: 'policy-violation', vendorLabel: 'ar:invalid', confidence: 'high' }]
		});
	});

	it('reads a claim it could not translate, or no finding at all, as partial — never an allow', () => {
		expect(read('ar-ambiguous')).toMatchObject({
			outcome: 'partial',
			matched: false,
			findings: [{ ran: false, vendorLabel: 'ar:translationAmbiguous' }]
		});
		expect(read('clean').outcome).toBe('partial');
	});

	it('runs offline from its stand-in, at pre-act, and never in a browser', async () => {
		expect(automatedReasoningService.hooks).toEqual(['pre-act']);
		expect(automatedReasoningService.browserCapable).toBe(false);
		const client = automatedReasoningService.createOffline({
			region: 'eu-west-2',
			guardrailId: 'craftabot-stand-in',
			offlineFixture: 'ar-invalid'
		});
		const result = await client.screen({
			hook: 'pre-act',
			text: 'The refund limit is £500.',
			envelope: { agentId: 'a', tick: 1 }
		});
		expect('reading' in result && result.reading.matched).toBe(true);
	});
});
