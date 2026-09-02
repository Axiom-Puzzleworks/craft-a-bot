import { describe, expect, it } from 'vitest';
import { runGuardrailChain, type ExternalCallRecord, type GuardrailVerdict } from '@craftabot/core';
import { createHostedGuardrails, filtersForRecord } from './guardrails.js';
import { defaultHostedStrings } from './strings.js';
import {
	actionPerformedEvent,
	context,
	decisionEvent,
	envelope,
	failed,
	finding,
	ok,
	reading,
	screening,
	senseEvent,
	stubService
} from './test-service.js';

const PROPOSED = { kind: 'action' as const, name: 'say', arguments: { text: 'hello' } };
const HISTORY = [
	senseEvent('a red ball'),
	decisionEvent('I will say hello'),
	actionPerformedEvent('You say hello.')
];

function build(
	service = stubService(),
	overrides: Partial<Parameters<typeof createHostedGuardrails>[0]> = {}
) {
	return createHostedGuardrails({
		idPrefix: 'test/guard',
		service,
		serviceConfig: { flavour: 'plain' },
		screening: screening({
			screenObservation: 'note',
			screenDecision: 'ask',
			screenResult: 'note'
		}),
		ctx: { fetch: () => Promise.reject(new Error('no network')), getCredential: () => 'secret-1' },
		envelope,
		now: () => 1000,
		...overrides
	});
}

describe('what the shell builds', () => {
	it('one guardrail per hook the service supports whose dial is not off, named and suffixed by hook', () => {
		const rails = build();
		expect(rails.map((r) => ({ id: r.id, hooks: r.hooks, name: r.name }))).toEqual([
			{ id: 'test/guard:observation', hooks: ['pre-think'], name: 'Guard Brick (observation)' },
			{ id: 'test/guard:decision', hooks: ['pre-act'], name: 'Guard Brick (decision)' },
			{ id: 'test/guard:result', hooks: ['post-act'], name: 'Guard Brick (result)' }
		]);
		for (const rail of rails) expect(rail.description.length).toBeGreaterThan(0);
	});

	it('skips a hook whose dial is off, and a hook the service does not support', () => {
		const decisionOnly = build(stubService(), {
			screening: screening({ screenObservation: 'off', screenDecision: 'ask', screenResult: 'off' })
		});
		expect(decisionOnly.map((r) => r.id)).toEqual(['test/guard:decision']);

		const pdp = build(stubService(ok(), { hooks: ['pre-act'] }));
		expect(pdp.map((r) => r.id)).toEqual(['test/guard:decision']);
	});

	it("takes a vendor's own names and strings", () => {
		const rails = build(stubService(), {
			names: { 'pre-act': { name: 'Armour Brick (decision)', description: 'Model Armor.' } },
			strings: { ...defaultHostedStrings, nothingToCheck: 'nowt' }
		});
		expect(rails[1]?.name).toBe('Armour Brick (decision)');
		expect(rails[0]?.name).toBe('Guard Brick (observation)');
	});

	it('builds one live client, handing it the config, the timeout and the credential reader', () => {
		const service = stubService();
		build(service, { screening: screening({ timeoutMs: 1234 }) });
		expect(service.created).toEqual([
			{ config: { flavour: 'plain' }, timeoutMs: 1234, credential: 'secret-1' }
		]);
	});

	it('builds the offline client instead when the dial says so, and never the live one', () => {
		const service = stubService();
		build(service, { screening: screening({ offline: true }) });
		expect(service.created).toEqual([]);
	});
});

describe('a check', () => {
	async function check(
		rail: ReturnType<typeof build>[number],
		ctx = context('pre-act', { history: HISTORY, proposed: PROPOSED })
	) {
		return rail.checkWithRecord!(ctx);
	}

	it('screens what the selector picks, with context, the proposed call and the envelope', async () => {
		const service = stubService();
		const [, decision] = build(service);
		const { verdict, external } = await check(decision!);
		expect(verdict).toEqual({ allow: true, note: defaultHostedStrings.allClear });
		expect(service.requests).toEqual([
			{
				hook: 'pre-act',
				text: 'I will say hello\nsay(text: hello)',
				context: 'a red ball',
				proposed: PROPOSED,
				policyInput: expect.anything(),
				envelope: { agentId: 'agent-1', tick: 3 }
			}
		]);
		expect(external).toEqual({
			service: 'stub',
			endpoint: 'https://stub.example.test/screen',
			latencyMs: 0,
			charsScreened: 'I will say hello\nsay(text: hello)'.length,
			outcome: 'ok',
			filters: { injection: { ran: true, matched: false } }
		});
	});

	it("assembles the record in the golden order: the service's own fields, then latency, chars, outcome, filters", async () => {
		const [, decision] = build();
		const { external } = await check(decision!);
		expect(Object.keys(external!)).toEqual([
			'service',
			'endpoint',
			'latencyMs',
			'charsScreened',
			'outcome',
			'filters'
		]);
	});

	it('measures latency on the wall clock when none is injected, and hands the client a timeout signal', async () => {
		const service = stubService();
		const [decision] = createHostedGuardrails({
			idPrefix: 'test/guard',
			service,
			serviceConfig: { flavour: 'plain' },
			screening: screening(),
			ctx: { fetch: () => Promise.reject(new Error('no network')), getCredential: () => undefined },
			envelope
		});
		const { external } = await check(decision!);
		expect(external?.latencyMs).toBeGreaterThanOrEqual(0);
	});

	it('measures latency on the injected clock', async () => {
		let t = 0;
		const [, decision] = build(stubService(), { now: () => (t += 7) });
		const { external } = await check(decision!);
		expect(external?.latencyMs).toBe(7);
	});

	it('makes no call and allows with "nothing to check" when the selector finds nothing', async () => {
		const service = stubService();
		const [observation] = build(service);
		const result = await check(observation!, context('pre-think'));
		expect(result).toEqual({ verdict: { allow: true, note: defaultHostedStrings.nothingToCheck } });
		expect(service.requests).toEqual([]);
	});

	it("writes outcome offline, with the reading's filters, when the offline client answered", async () => {
		const service = stubService();
		const [decision] = build(service, { screening: screening({ offline: true }) });
		const { external } = await check(decision!);
		expect(external?.outcome).toBe('offline');
		expect(service.offlineRequests).toHaveLength(1);
	});

	it('writes the transport kind as the outcome, no filters, and fails closed', async () => {
		const [, decision] = build(stubService(failed('timeout')));
		const { verdict, external } = await check(decision!);
		expect(verdict).toEqual({
			allow: false,
			reason: defaultHostedStrings.transport('timeout'),
			disposition: 'stop-run'
		});
		expect(external).toEqual({
			service: 'stub',
			endpoint: 'https://stub.example.test/screen',
			latencyMs: 0,
			charsScreened: 'I will say hello\nsay(text: hello)'.length,
			outcome: 'timeout'
		});
	});

	it("passes the reading's own outcome through, and records the vendor's confidence string", async () => {
		const service = stubService(
			ok({
				outcome: 'partial',
				findings: [
					finding({ matched: true, confidence: 'high', vendorConfidence: 'HIGH' }),
					finding({ category: 'harmful', vendorLabel: 'hate', ran: false })
				]
			})
		);
		const [, decision] = build(service);
		const { verdict, external } = await check(decision!);
		expect(verdict).toMatchObject({ pause: true });
		expect(external?.outcome).toBe('partial');
		expect(external?.filters).toEqual({
			injection: { ran: true, matched: true, confidence: 'HIGH' },
			hate: { ran: false, matched: false }
		});
	});

	it('check() drops the record, for a host that predates the seam', async () => {
		const [, decision] = build();
		const verdict: GuardrailVerdict = await decision!.check(
			context('pre-act', { history: HISTORY, proposed: PROPOSED })
		);
		expect(verdict).toEqual({ allow: true, note: defaultHostedStrings.allClear });
	});

	it("takes a caller's own selector for a hook", async () => {
		const service = stubService();
		const [observation] = build(service, {
			selectors: { 'pre-think': () => ({ text: 'custom' }) }
		});
		await check(observation!, context('pre-think'));
		expect(service.requests[0]?.text).toBe('custom');
	});
});

describe('through the chain, at every hook', () => {
	it('is reported at each hook with its record, and stops the chain on the first non-allow', async () => {
		const service = stubService((request) =>
			request.hook === 'post-act'
				? ok({ findings: [finding({ matched: true, confidence: 'high' })] })
				: ok()
		);
		const rails = build(service, {
			screening: screening({
				screenObservation: 'note',
				screenDecision: 'ask',
				screenResult: 'stop'
			})
		});
		const seen: Array<{ hook: string; id: string; external?: ExternalCallRecord }> = [];
		const onChecked =
			(hook: string) =>
			(guardrail: { id: string }, _v: GuardrailVerdict, external?: ExternalCallRecord) =>
				seen.push({ hook, id: guardrail.id, ...(external ? { external } : {}) });

		const preThink = await runGuardrailChain(
			rails,
			'pre-think',
			context('pre-think', { history: HISTORY }),
			onChecked('pre-think')
		);
		const preAct = await runGuardrailChain(
			rails,
			'pre-act',
			context('pre-act', { history: HISTORY, proposed: PROPOSED }),
			onChecked('pre-act')
		);
		const postAct = await runGuardrailChain(
			rails,
			'post-act',
			context('post-act', { history: HISTORY }),
			onChecked('post-act')
		);

		expect(preThink.verdict).toEqual({ allow: true });
		expect(preAct.verdict).toEqual({ allow: true });
		expect(postAct.verdict).toMatchObject({ allow: false, disposition: 'stop-run' });
		expect(postAct.guardrail?.id).toBe('test/guard:result');
		expect(seen.map((s) => `${s.hook} ${s.id} ${s.external?.outcome}`)).toEqual([
			'pre-think test/guard:observation ok',
			'pre-act test/guard:decision ok',
			'post-act test/guard:result ok'
		]);
		expect(service.requests.map((r) => r.text)).toEqual([
			'a red ball',
			'I will say hello\nsay(text: hello)',
			'You say hello.'
		]);
	});
});

describe('filtersForRecord', () => {
	it('keys by vendor label, prefers the vendor confidence, falls back to the neutral one, omits none', () => {
		expect(
			filtersForRecord(
				reading({
					findings: [
						finding({ vendorLabel: 'a', confidence: 'low', vendorConfidence: 'LOW_AND_ABOVE' }),
						finding({ vendorLabel: 'b', confidence: 'low' }),
						finding({ vendorLabel: 'c' })
					]
				})
			)
		).toEqual({
			a: { ran: true, matched: false, confidence: 'LOW_AND_ABOVE' },
			b: { ran: true, matched: false, confidence: 'low' },
			c: { ran: true, matched: false }
		});
	});
});
