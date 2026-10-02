import type { Guardrail, GuardrailVerdict } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { shadowGuardrail, shadowVerdict } from './shadow.js';
import { context } from './test-context.js';

/** WP149 (`110-CONTROL-SUITE-PLAN.md` §10): a shadowed guard records what it would have done and changes nothing. */
const always = (verdict: GuardrailVerdict, withRecord = false): Guardrail => ({
	id: 'test/guard',
	name: 'Guard',
	description: 'Always the same verdict.',
	hooks: ['pre-act'],
	check: () => verdict,
	...(withRecord
		? { checkWithRecord: () => Promise.resolve({ verdict, external: undefined as never }) }
		: {})
});

describe('shadow mode (WP149)', () => {
	it('turns every verdict that would change the run into an annotation that says so', () => {
		expect(shadowVerdict({ allow: false, reason: 'no', disposition: 'block-action' })).toEqual({
			allow: true,
			verdictKind: 'annotate',
			finding: { category: 'shadow', label: 'would block-action: no' }
		});
		expect(shadowVerdict({ pause: true, reason: 'ask' })).toMatchObject({
			allow: true,
			finding: { label: 'would pause: ask' }
		});
		expect(shadowVerdict({ allow: true, verdictKind: 'redact', redactedText: 'x' })).toMatchObject({
			allow: true,
			verdictKind: 'annotate',
			finding: { label: 'would redact' }
		});
		expect(
			shadowVerdict({ allow: true, mark: { provenance: 'untrusted', source: 'tool:bureau' } })
		).toMatchObject({ finding: { label: 'would mark tool:bureau untrusted' } });
		expect(shadowVerdict({ allow: true, note: 'fine' })).toEqual({ allow: true, note: 'fine' });
	});

	it('wraps check and checkWithRecord alike, keeping the guardrail’s id', async () => {
		const stop: GuardrailVerdict = { allow: false, reason: 'halt', disposition: 'stop-run' };
		const plain = shadowGuardrail(always(stop));
		expect(plain.id).toBe('test/guard');
		expect(await plain.check(context({ hook: 'pre-act' }))).toMatchObject({ allow: true });
		expect(plain.checkWithRecord).toBeUndefined();
		const recorded = shadowGuardrail(always(stop, true));
		expect((await recorded.checkWithRecord!(context({ hook: 'pre-act' }))).verdict).toMatchObject({
			allow: true,
			finding: { label: 'would stop-run: halt' }
		});
	});
});
