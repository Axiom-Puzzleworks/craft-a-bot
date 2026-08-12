import { describe, expect, it, vi } from 'vitest';
import { isAllowed, isPause, runGuardrailChain } from './guardrail-chain.js';
import type { Guardrail, GuardrailContext, GuardrailVerdict } from '../types/guardrail.js';

function guardrail(
	id: string,
	verdict: GuardrailVerdict,
	hooks: Guardrail['hooks'] = ['pre-act']
): Guardrail {
	return { id, name: id, description: id, hooks, check: () => verdict };
}

const context = { hook: 'pre-act', tick: 1 } as unknown as GuardrailContext;

describe('runGuardrailChain', () => {
	it('allows when every guardrail allows', async () => {
		const outcome = await runGuardrailChain(
			[guardrail('a', { allow: true }), guardrail('b', { allow: true })],
			'pre-act',
			context,
			() => {}
		);
		expect(isAllowed(outcome.verdict)).toBe(true);
		expect(outcome.guardrail).toBeUndefined();
	});

	it('allows when there are no guardrails at all', async () => {
		const outcome = await runGuardrailChain([], 'pre-act', context, () => {});
		expect(isAllowed(outcome.verdict)).toBe(true);
	});

	it('reports every check, pass or fail, so the trace shows governance working', async () => {
		const onChecked = vi.fn();
		await runGuardrailChain(
			[guardrail('a', { allow: true }), guardrail('b', { allow: true })],
			'pre-act',
			context,
			onChecked
		);
		expect(onChecked).toHaveBeenCalledTimes(2);
	});

	it('stops at the first non-allow verdict', async () => {
		const onChecked = vi.fn();
		const denied: GuardrailVerdict = { allow: false, reason: 'no', disposition: 'block-action' };
		const outcome = await runGuardrailChain(
			[guardrail('a', denied), guardrail('b', { allow: true })],
			'pre-act',
			context,
			onChecked
		);
		expect(outcome.guardrail?.id).toBe('a');
		expect(onChecked).toHaveBeenCalledTimes(1);
	});

	it('skips guardrails not registered for this hook', async () => {
		const onChecked = vi.fn();
		await runGuardrailChain(
			[
				guardrail('pre-think-only', { allow: false, reason: 'no', disposition: 'stop-run' }, [
					'pre-think'
				])
			],
			'pre-act',
			context,
			onChecked
		);
		expect(onChecked).not.toHaveBeenCalled();
	});

	it('awaits asynchronous guardrails', async () => {
		const asyncGuardrail: Guardrail = {
			id: 'slow',
			name: 'Slow',
			description: 'Takes its time.',
			hooks: ['pre-act'],
			check: () =>
				Promise.resolve({ allow: false, reason: 'eventually no', disposition: 'stop-run' })
		};
		const outcome = await runGuardrailChain([asyncGuardrail], 'pre-act', context, () => {});
		expect(isAllowed(outcome.verdict)).toBe(false);
	});

	it('surfaces a pause verdict for the approval flow', async () => {
		const outcome = await runGuardrailChain(
			[guardrail('ask', { pause: true, reason: 'check first' })],
			'pre-act',
			context,
			() => {}
		);
		expect(isPause(outcome.verdict)).toBe(true);
		expect(isAllowed(outcome.verdict)).toBe(false);
	});
});

describe('verdict helpers', () => {
	it('distinguish the three verdict shapes', () => {
		expect(isAllowed({ allow: true })).toBe(true);
		expect(isAllowed({ allow: false, reason: 'x', disposition: 'stop-run' })).toBe(false);
		expect(isPause({ allow: true })).toBe(false);
		expect(isPause({ pause: true, reason: 'x' })).toBe(true);
	});
});
