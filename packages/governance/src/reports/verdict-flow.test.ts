import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { engineEventSchema, type EngineEvent } from '@craftabot/core';
import { verdictFlow, verdictFlowSignature } from './verdict-flow.js';

/**
 * WP101 (`88-STUDIO.md` §4): the flow over the Armour golden trace — one
 * row per `guardrail.checked`, in order, with the hosted call's latency
 * from the `guardrail.external` before it — and over the confused-deputy
 * trace, where a rule denies.
 */
const load = (path: string): EngineEvent[] => {
	const raw = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as unknown[];
	return raw.map((event) => engineEventSchema.parse(event));
};

const signatureOf = (event: EngineEvent): string => {
	if (event.type !== 'guardrail.checked') return '';
	const verdict = event.payload.verdict as {
		allow?: boolean;
		pause?: boolean;
		verdictKind?: string;
		disposition?: string;
	};
	const kind =
		verdict.allow === true
			? (verdict.verdictKind ?? 'allow')
			: verdict.pause === true
				? 'pause'
				: verdict.disposition;
	return `${event.payload.guardrailId}@${event.payload.hook}:${kind}`;
};

describe('verdictFlow', () => {
	it('is the guardrail.checked sequence, row for row, with the latency of the hosted call before each', () => {
		const events = load('../../../packs/geap/src/fixtures/trace.geap-armour-offline.v1.json');
		const rows = verdictFlow(events);
		const checked = events.filter((event) => event.type === 'guardrail.checked');
		expect(rows).toHaveLength(checked.length);
		expect(rows.map((row) => events[row.seq])).toEqual(checked);
		expect(verdictFlowSignature(rows)).toEqual(checked.map(signatureOf));
		const armour = rows.filter((row) => row.guardrailId.startsWith('geap/armor'));
		expect(armour.length).toBeGreaterThan(0);
		for (const row of armour) expect(row.latencyMs).toBe(0);
		for (const row of rows.filter((row) => !row.guardrailId.startsWith('geap/armor')))
			expect(row.latencyMs).toBeUndefined();
	});

	it('reads a denial with its reason and disposition', () => {
		const rows = verdictFlow(
			load('../../../packs/starter/src/fixtures/trace.confused-deputy.v1.json')
		);
		expect(rows.length).toBeGreaterThan(0);
		const denied = rows.find((row) => row.verdict === 'block-action' || row.verdict === 'stop-run');
		expect(denied?.reason).toBeTruthy();
	});

	it('reads the component verdicts and the redaction', () => {
		const base = {
			id: '11111111-1111-4111-8111-111111111112',
			runId: '11111111-1111-4111-8111-111111111111',
			timestamp: '2026-09-12T00:00:00.000Z',
			tick: 1
		};
		const rows = verdictFlow([
			{
				...base,
				type: 'guardrail.checked',
				payload: {
					guardrailId: 'x',
					hook: 'post-act',
					componentId: 'c',
					point: { kind: 'post-act' },
					verdict: {
						allow: true,
						verdictKind: 'redact',
						redactedText: 'the [card] number',
						finding: { category: 'sensitive-data', severity: 'medium', summary: 'a card' }
					}
				}
			} as unknown as EngineEvent,
			{
				...base,
				type: 'guardrail.checked',
				payload: {
					guardrailId: 'y',
					hook: 'pre-act',
					verdict: { allow: false, reason: 'no', disposition: 'stop-run', cause: 'could-not-check' }
				}
			} as unknown as EngineEvent
		]);
		expect(rows[0]).toMatchObject({
			verdict: 'redact',
			componentId: 'c',
			point: { kind: 'post-act' },
			findingCategory: 'sensitive-data',
			redactedText: 'the [card] number'
		});
		expect(rows[1]).toMatchObject({ verdict: 'stop-run', reason: 'no', cause: 'could-not-check' });
	});
});
