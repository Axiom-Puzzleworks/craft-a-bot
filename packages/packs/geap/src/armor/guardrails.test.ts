import { describe, expect, it } from 'vitest';
import type { GuardrailContext, GuardrailHook } from '@craftabot/core';
import type { ArmorClient, ArmorClientResult } from './client.js';
import { armorConfigSchema } from './config.js';
import type { ArmorConfig, ArmorConfigInput } from './config.js';
import { armorGuardrail, verdictFor } from './guardrails.js';
import type { ArmorFilterKey, ArmorReading } from './reading.js';
import {
	ALL_CLEAR_NOTE,
	GUARD_DID_NOT_FINISH,
	NOTHING_TO_CHECK,
	transportReason
} from './strings.js';
import type { DecisionScreen } from './text.js';

const REQUIRED = { projectId: 'proj-1', location: 'europe-west2', templateId: 'cab-armour' };

function config(overrides: Partial<ArmorConfigInput> = {}): ArmorConfig {
	return armorConfigSchema.parse({ ...REQUIRED, ...overrides });
}

const CLEAN_FILTERS: ArmorReading['filters'] = {
	injection: { ran: true, matched: false },
	hate: { ran: true, matched: false },
	harassment: { ran: true, matched: false },
	dangerous: { ran: true, matched: false },
	sexual: { ran: true, matched: false },
	sensitiveData: { ran: true, matched: false },
	maliciousUri: { ran: true, matched: false },
	csam: { ran: true, matched: false }
};

function reading(
	overrides: Partial<ArmorReading> = {},
	filterOverrides: Partial<ArmorReading['filters']> = {}
): ArmorReading {
	return {
		outcome: 'ok',
		matched: false,
		filters: { ...CLEAN_FILTERS, ...filterOverrides },
		...overrides
	};
}

function ok(r: ArmorReading): ArmorClientResult {
	return { reading: r };
}

describe('verdictFor — csam, never dialable', () => {
	it('stops the run on a csam match regardless of every other dial', () => {
		const result = ok(reading({ matched: true }, { csam: { ran: true, matched: true } }));
		for (const hook of ['pre-think', 'pre-act', 'post-act'] as GuardrailHook[]) {
			const verdict = verdictFor(
				result,
				hook,
				config({ screenDecision: 'note', screenObservation: 'note', screenResult: 'note' })
			);
			expect(verdict).toEqual({
				allow: false,
				reason: expect.stringContaining('always be stopped') as unknown as string,
				disposition: 'stop-run'
			});
		}
	});
});

describe('verdictFor — nothing fired', () => {
	it('allows with the all-clear note when outcome is ok', () => {
		const verdict = verdictFor(ok(reading()), 'pre-act', config());
		expect(verdict).toEqual({ allow: true, note: ALL_CLEAR_NOTE });
	});

	it('stops the run when outcome is partial and onFailure defaults to stop-run', () => {
		const verdict = verdictFor(ok(reading({ outcome: 'partial' })), 'pre-act', config());
		expect(verdict).toEqual({
			allow: false,
			reason: GUARD_DID_NOT_FINISH,
			disposition: 'stop-run'
		});
	});

	it('stops the run when outcome is failure and onFailure defaults to stop-run', () => {
		const verdict = verdictFor(ok(reading({ outcome: 'failure' })), 'pre-act', config());
		expect(verdict).toEqual({
			allow: false,
			reason: GUARD_DID_NOT_FINISH,
			disposition: 'stop-run'
		});
	});

	it('allows with a note when outcome is partial and onFailure is allow-with-note', () => {
		const verdict = verdictFor(
			ok(reading({ outcome: 'partial' })),
			'pre-act',
			config({ onFailure: 'allow-with-note' })
		);
		expect(verdict).toEqual({ allow: true, note: GUARD_DID_NOT_FINISH });
	});
});

describe('verdictFor — transport/auth errors', () => {
	const KINDS = [
		'bad-token',
		'no-permission',
		'no-template',
		'quota',
		'timeout',
		'unavailable'
	] as const;

	it.each(KINDS)('stops the run on %s by default', (kind) => {
		const verdict = verdictFor({ error: { kind, message: 'x' } }, 'pre-act', config());
		expect(verdict).toEqual({
			allow: false,
			reason: transportReason(kind),
			disposition: 'stop-run'
		});
	});

	it.each(KINDS)('allows with a note on %s under allow-with-note', (kind) => {
		const verdict = verdictFor(
			{ error: { kind, message: 'x' } },
			'pre-act',
			config({ onFailure: 'allow-with-note' })
		);
		expect(verdict).toEqual({ allow: true, note: transportReason(kind) });
	});
});

describe('verdictFor — a fired filter at pre-act, every screenDecision dial', () => {
	const injectionMatch = (confidence: ArmorReading['filters']['injection']['confidence']) =>
		ok(
			reading(
				{ matched: true },
				{ injection: { ran: true, matched: true, ...(confidence ? { confidence } : {}) } }
			)
		);

	it('note: allows with the composed reason', () => {
		const verdict = verdictFor(
			injectionMatch('HIGH'),
			'pre-act',
			config({ screenDecision: 'note' })
		);
		expect(verdict).toEqual({
			allow: true,
			note: expect.stringContaining('sneaky instruction') as unknown as string
		});
	});

	it('block: block-action with the composed reason', () => {
		const verdict = verdictFor(
			injectionMatch('HIGH'),
			'pre-act',
			config({ screenDecision: 'block' })
		);
		expect(verdict).toMatchObject({ allow: false, disposition: 'block-action' });
	});

	it('ask: pauses for approval', () => {
		const verdict = verdictFor(
			injectionMatch('HIGH'),
			'pre-act',
			config({ screenDecision: 'ask' })
		);
		expect(verdict).toMatchObject({ pause: true });
	});

	it('stop: stop-run', () => {
		const verdict = verdictFor(
			injectionMatch('HIGH'),
			'pre-act',
			config({ screenDecision: 'stop' })
		);
		expect(verdict).toMatchObject({ allow: false, disposition: 'stop-run' });
	});

	it('off at the filter level: no screening even though the hook dial is set (config validation, not verdictFor, is what stops the hook running at all — this proves the override wins)', () => {
		const verdict = verdictFor(
			injectionMatch('HIGH'),
			'pre-act',
			config({ screenDecision: 'stop', filters: { injection: 'off' } })
		);
		expect(verdict).toEqual({ allow: true, note: ALL_CLEAR_NOTE });
	});
});

describe('verdictFor — clamping at pre-think and post-act', () => {
	it('clamps a block override to stop at pre-think', () => {
		const result = ok(reading({ matched: true }, { injection: { ran: true, matched: true } }));
		const verdict = verdictFor(result, 'pre-think', config({ filters: { injection: 'block' } }));
		expect(verdict).toMatchObject({ allow: false, disposition: 'stop-run' });
	});

	it('clamps an ask override to stop at post-act', () => {
		const result = ok(reading({ matched: true }, { maliciousUri: { ran: true, matched: true } }));
		const verdict = verdictFor(result, 'post-act', config({ filters: { maliciousLinks: 'ask' } }));
		expect(verdict).toMatchObject({ allow: false, disposition: 'stop-run' });
	});

	it('clamps a note override to note (no-op) at pre-think', () => {
		const result = ok(reading({ matched: true }, { injection: { ran: true, matched: true } }));
		const verdict = verdictFor(result, 'pre-think', config({ filters: { injection: 'note' } }));
		expect(verdict).toMatchObject({ allow: true });
	});
});

describe('verdictFor — per-filter override wins over the hook dial', () => {
	it('a stricter override on one filter fires even though the hook dial is looser', () => {
		const result = ok(reading({ matched: true }, { sensitiveData: { ran: true, matched: true } }));
		const verdict = verdictFor(
			result,
			'pre-act',
			config({ screenDecision: 'note', filters: { sensitiveData: 'block' } })
		);
		expect(verdict).toMatchObject({ allow: false, disposition: 'block-action' });
	});

	it('a looser override on one filter downgrades even though the hook dial is stricter', () => {
		const result = ok(reading({ matched: true }, { sensitiveData: { ran: true, matched: true } }));
		const verdict = verdictFor(
			result,
			'pre-act',
			config({ screenDecision: 'stop', filters: { sensitiveData: 'note' } })
		);
		expect(verdict).toMatchObject({ allow: true });
	});
});

describe('verdictFor — several filters fired at once', () => {
	it('picks the strictest disposition and names every fired filter in the reason', () => {
		const result = ok(
			reading(
				{ matched: true },
				{
					injection: { ran: true, matched: true, confidence: 'HIGH' },
					sensitiveData: { ran: true, matched: true }
				}
			)
		);
		// injection inherits screenDecision (note); sensitiveData is overridden to stop.
		const verdict = verdictFor(
			result,
			'pre-act',
			config({ screenDecision: 'note', filters: { sensitiveData: 'stop' } })
		);
		expect(verdict).toMatchObject({ allow: false, disposition: 'stop-run' });
		expect((verdict as { reason: string }).reason).toContain('sneaky instruction');
		expect((verdict as { reason: string }).reason).toContain('a secret');
	});
});

describe('verdictFor — every ArmorFilterKey maps through effectiveDisposition without throwing', () => {
	const KEYS: ArmorFilterKey[] = [
		'injection',
		'hate',
		'harassment',
		'dangerous',
		'sexual',
		'sensitiveData',
		'maliciousUri',
		'csam'
	];

	it.each(KEYS)('%s alone, at every hook, produces a verdict', (key) => {
		for (const hook of ['pre-think', 'pre-act', 'post-act'] as GuardrailHook[]) {
			const result = ok(reading({ matched: true }, { [key]: { ran: true, matched: true } }));
			expect(() => verdictFor(result, hook, config({ screenDecision: 'ask' }))).not.toThrow();
		}
	});
});

// --- armorGuardrail: the single factory, three instances ---

function ctx(overrides: Partial<GuardrailContext> = {}): GuardrailContext {
	return {
		hook: 'pre-act',
		tick: 1,
		spec: {} as GuardrailContext['spec'],
		usage: { ticks: 1, inputTokens: 0, outputTokens: 0 },
		worldState: {} as GuardrailContext['worldState'],
		history: [],
		...overrides
	};
}

function fakeClient(
	result: ArmorClientResult
): ArmorClient & { calls: Array<{ method: string; args: unknown[] }> } {
	const calls: Array<{ method: string; args: unknown[] }> = [];
	return {
		calls,
		sanitizeUserPrompt: (text: string) => {
			calls.push({ method: 'sanitizeUserPrompt', args: [text] });
			return Promise.resolve(result);
		},
		sanitizeModelResponse: (text: string, userPrompt?: string) => {
			calls.push({ method: 'sanitizeModelResponse', args: [text, userPrompt] });
			return Promise.resolve(result);
		}
	};
}

describe('armorGuardrail', () => {
	it('does not call the client and allows with "nothing to check" when the selector finds nothing', async () => {
		const client = fakeClient(ok(reading()));
		const guardrail = armorGuardrail(
			'geap/armor:decision',
			'pre-act',
			() => undefined,
			config(),
			client
		);
		const verdict = await guardrail.check(ctx());
		expect(verdict).toEqual({ allow: true, note: NOTHING_TO_CHECK });
		expect(client.calls).toHaveLength(0);
	});

	it("pre-think calls sanitizeUserPrompt with the selector's string", async () => {
		const client = fakeClient(ok(reading()));
		const guardrail = armorGuardrail(
			'geap/armor:observation',
			'pre-think',
			() => 'a rug and a lamp',
			config(),
			client
		);
		await guardrail.check(ctx({ hook: 'pre-think' }));
		expect(client.calls).toEqual([{ method: 'sanitizeUserPrompt', args: ['a rug and a lamp'] }]);
	});

	it("post-act calls sanitizeModelResponse with the selector's string and no userPrompt", async () => {
		const client = fakeClient(ok(reading()));
		const guardrail = armorGuardrail(
			'geap/armor:result',
			'post-act',
			() => 'you moved north',
			config(),
			client
		);
		await guardrail.check(ctx({ hook: 'post-act' }));
		expect(client.calls).toEqual([
			{ method: 'sanitizeModelResponse', args: ['you moved north', undefined] }
		]);
	});

	it('pre-act calls sanitizeModelResponse with the decision text and the userPrompt context', async () => {
		const client = fakeClient(ok(reading()));
		const screen: DecisionScreen = { text: 'say("hi")', userPrompt: 'a teddy on the rug' };
		const guardrail = armorGuardrail(
			'geap/armor:decision',
			'pre-act',
			() => screen,
			config(),
			client
		);
		await guardrail.check(ctx());
		expect(client.calls).toEqual([
			{ method: 'sanitizeModelResponse', args: ['say("hi")', 'a teddy on the rug'] }
		]);
	});

	it('carries the hook on hooks[] and names/describes itself by hook', () => {
		const client = fakeClient(ok(reading()));
		const observation = armorGuardrail(
			'geap/armor:observation',
			'pre-think',
			() => undefined,
			config(),
			client
		);
		const decision = armorGuardrail(
			'geap/armor:decision',
			'pre-act',
			() => undefined,
			config(),
			client
		);
		const result = armorGuardrail(
			'geap/armor:result',
			'post-act',
			() => undefined,
			config(),
			client
		);
		expect(observation.hooks).toEqual(['pre-think']);
		expect(decision.hooks).toEqual(['pre-act']);
		expect(result.hooks).toEqual(['post-act']);
		expect(new Set([observation.name, decision.name, result.name]).size).toBe(3);
	});
});

describe('armorGuardrail — never throws on a transport error', () => {
	it('resolves a verdict rather than rejecting when the client returns an error', async () => {
		const client = fakeClient({ error: { kind: 'timeout', message: 'x' } });
		const guardrail = armorGuardrail(
			'geap/armor:decision',
			'pre-act',
			() => 'say("hi")',
			config(),
			client
		);
		await expect(guardrail.check(ctx())).resolves.toMatchObject({
			allow: false,
			disposition: 'stop-run'
		});
	});
});

describe('armorGuardrail — checkWithRecord (25-… §4.7, WP35 stage B)', () => {
	it('check() and checkWithRecord() agree on the verdict', async () => {
		const result = ok(
			reading({ matched: true }, { injection: { ran: true, matched: true, confidence: 'HIGH' } })
		);
		const client = fakeClient(result);
		const guardrail = armorGuardrail(
			'geap/armor:decision',
			'pre-act',
			() => 'say("hi")',
			config({ screenDecision: 'block' }),
			client
		);

		const viaCheck = await guardrail.check(ctx());
		const viaRecord = await guardrail.checkWithRecord?.(ctx());
		expect(viaRecord?.verdict).toEqual(viaCheck);
	});

	it('returns no external record when the selector finds nothing to check', async () => {
		const client = fakeClient(ok(reading()));
		const guardrail = armorGuardrail(
			'geap/armor:decision',
			'pre-act',
			() => undefined,
			config(),
			client
		);
		const outcome = await guardrail.checkWithRecord?.(ctx());
		expect(outcome).toEqual({ verdict: { allow: true, note: NOTHING_TO_CHECK } });
	});

	it('records service, template, endpoint (with the right method suffix) and charsScreened', async () => {
		const client = fakeClient(ok(reading()));
		const guardrail = armorGuardrail(
			'geap/armor:observation',
			'pre-think',
			() => 'a rug and a lamp',
			config({ templateId: 'cab-armour', location: 'europe-west2' }),
			client
		);
		const outcome = await guardrail.checkWithRecord?.(ctx({ hook: 'pre-think' }));
		expect(outcome?.external).toMatchObject({
			service: 'model-armor',
			template: 'cab-armour',
			charsScreened: 'a rug and a lamp'.length
		});
		expect(outcome?.external?.endpoint).toContain('europe-west2');
		expect(outcome?.external?.endpoint).toContain(':sanitizeUserPrompt');
	});

	it('uses the modelResponse method suffix at pre-act and post-act', async () => {
		const client = fakeClient(ok(reading()));
		const decision = armorGuardrail(
			'geap/armor:decision',
			'pre-act',
			() => ({ text: 'say("hi")' }) satisfies DecisionScreen,
			config(),
			client
		);
		const result = armorGuardrail(
			'geap/armor:result',
			'post-act',
			() => 'you moved north',
			config(),
			client
		);

		expect((await decision.checkWithRecord?.(ctx()))?.external?.endpoint).toContain(
			':sanitizeModelResponse'
		);
		expect(
			(await result.checkWithRecord?.(ctx({ hook: 'post-act' })))?.external?.endpoint
		).toContain(':sanitizeModelResponse');
	});

	it('measures a non-negative latency', async () => {
		const client = fakeClient(ok(reading()));
		const guardrail = armorGuardrail(
			'geap/armor:decision',
			'pre-act',
			() => 'say("hi")',
			config(),
			client
		);
		const outcome = await guardrail.checkWithRecord?.(ctx());
		expect(outcome?.external?.latencyMs).toBeGreaterThanOrEqual(0);
	});

	it("labels outcome from the reading's own outcome on success", async () => {
		const client = fakeClient(ok(reading({ outcome: 'partial' })));
		const guardrail = armorGuardrail(
			'geap/armor:decision',
			'pre-act',
			() => 'say("hi")',
			config(),
			client
		);
		const outcome = await guardrail.checkWithRecord?.(ctx());
		expect(outcome?.external?.outcome).toBe('partial');
	});

	it('labels outcome from the transport error kind on failure', async () => {
		const client = fakeClient({ error: { kind: 'quota', message: 'x' } });
		const guardrail = armorGuardrail(
			'geap/armor:decision',
			'pre-act',
			() => 'say("hi")',
			config(),
			client
		);
		const outcome = await guardrail.checkWithRecord?.(ctx());
		expect(outcome?.external?.outcome).toBe('quota');
	});

	it("labels outcome 'offline' when the config is offline, even though the fake client still resolved a reading", async () => {
		const client = fakeClient(ok(reading()));
		const guardrail = armorGuardrail(
			'geap/armor:decision',
			'pre-act',
			() => 'say("hi")',
			config({ offline: true }),
			client
		);
		const outcome = await guardrail.checkWithRecord?.(ctx());
		expect(outcome?.external?.outcome).toBe('offline');
	});

	it('carries the filter breakdown on a successful reading, keyed the same as ArmorReading.filters', async () => {
		const client = fakeClient(
			ok(
				reading({ matched: true }, { injection: { ran: true, matched: true, confidence: 'HIGH' } })
			)
		);
		const guardrail = armorGuardrail(
			'geap/armor:decision',
			'pre-act',
			() => 'say("hi")',
			config(),
			client
		);
		const outcome = await guardrail.checkWithRecord?.(ctx());
		expect(outcome?.external?.filters?.injection).toEqual({
			ran: true,
			matched: true,
			confidence: 'HIGH'
		});
		expect(outcome?.external?.filters?.csam).toEqual({ ran: true, matched: false });
	});

	it('omits filters entirely on a transport error, since nothing ran', async () => {
		const client = fakeClient({ error: { kind: 'unavailable', message: 'x' } });
		const guardrail = armorGuardrail(
			'geap/armor:decision',
			'pre-act',
			() => 'say("hi")',
			config(),
			client
		);
		const outcome = await guardrail.checkWithRecord?.(ctx());
		expect(outcome?.external?.filters).toBeUndefined();
	});

	it('never carries the token or any screened text on the external record', async () => {
		const client = fakeClient(ok(reading()));
		const guardrail = armorGuardrail(
			'geap/armor:decision',
			'pre-act',
			() => 'a very secret sentence nobody should see',
			config(),
			client
		);
		const outcome = await guardrail.checkWithRecord?.(ctx());
		expect(JSON.stringify(outcome?.external)).not.toContain('a very secret sentence');
	});
});
