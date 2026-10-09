import { describe, expect, it } from 'vitest';
import type { GuardrailContext } from '@craftabot/core';
import { contextAssemblyComponent } from './context-assembly.js';

/**
 * **Context assembly** (plan 114 WP206): at `pre-think` the composed prompt must carry what the stage is scored against. A complete prompt
 * is allowed and its digest recorded; a missing text is an annotate finding (or ends the run), naming what is missing; no messages — a reflex
 * tick — is nothing to check.
 */
function check(config: Parameters<typeof contextAssemblyComponent.compile>[0], content?: string) {
	const [guardrail] = contextAssemblyComponent.compile(
		config,
		{} as never,
		{
			kind: 'pre-think'
		} as never
	);
	return guardrail!.check({
		tick: 1,
		...(content === undefined ? {} : { messages: [{ role: 'user' as const, content }] })
	} as unknown as GuardrailContext);
}

describe('governance/context-assembly (WP206)', () => {
	it('allows a prompt that carries every required text and records which prompt it was', async () => {
		const verdict = await check(
			{ mustContain: ['rule:', 'worksheet'] },
			'rule: refer\nworksheet ready'
		);
		expect(verdict).toMatchObject({
			allow: true,
			verdictKind: 'annotate',
			finding: {
				category: 'context-complete',
				label: expect.stringMatching(/^prompt [0-9a-f]{12}$/)
			}
		});
	});

	it('notes what a prompt lacks, naming it, and lets the turn go on', async () => {
		const verdict = await check({ mustContain: ['rule:', 'worksheet'] }, 'worksheet ready');
		expect(verdict).toMatchObject({
			allow: true,
			verdictKind: 'annotate',
			finding: { category: 'context-missing', label: expect.stringContaining('lacks rule:') }
		});
	});

	it('stops the run when asked to, with the reason', async () => {
		const verdict = await check({ mustContain: ['rule:'], verdict: 'stop-run' }, 'nothing here');
		expect(verdict).toMatchObject({
			allow: false,
			disposition: 'stop-run',
			reason: expect.stringContaining('does not carry what the stage is scored against')
		});
	});

	it('has nothing to check on a tick with no composed prompt', async () => {
		expect(await check({ mustContain: ['rule:'] })).toEqual({ allow: true });
	});

	it('explains itself and refuses a config with nothing required', () => {
		expect(contextAssemblyComponent.explain({ mustContain: ['a', 'b'] })).toContain(
			'2 required texts'
		);
		expect(() => contextAssemblyComponent.configSchema.parse({ mustContain: [] })).toThrow();
	});
});
