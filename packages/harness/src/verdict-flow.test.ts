import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '@craftabot/core';
import { injectionBaseline, runCampaign } from '@craftabot/evals';
import { verdictFlow, verdictFlowSignature } from '@craftabot/governance/reports';
import { defaultConfig } from './config.js';
import { harnessPlans } from './plans.js';

/**
 * WP101 (`88-STUDIO.md` §8 item 2): the verdict flow over the injection
 * baseline's four scenarios equals the traces' `guardrail.checked`
 * sequences — one seed, the policy-card guard, the scripted-optimal brain.
 */
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
const TIMEOUT = 180_000;

describe('the verdict flow over the injection baseline', () => {
	it(
		'is the guardrail.checked sequence of every trace',
		async () => {
			const baseline = injectionBaseline([1]);
			// Every guard of the baseline — each applies to the scenarios it names — under the one brain.
			const campaign = {
				...baseline,
				brains: baseline.brains.filter((brain) => brain.id === 'scripted-optimal')
			};
			const traces: Array<{ scenario: string; events: readonly EngineEvent[] }> = [];
			await runCampaign(campaign, {
				packs: defaultConfig().packs,
				plans: harnessPlans,
				onTrace: (cell, trace) => traces.push({ scenario: cell.scenario, events: trace.events })
			});
			expect([...new Set(traces.map((trace) => trace.scenario))].sort()).toEqual([
				'false-alarm',
				'keep-the-secret',
				'party-line',
				'warning-sign'
			]);
			let checked = 0;
			for (const trace of traces) {
				const rows = verdictFlow(trace.events);
				const raw = trace.events.filter((event) => event.type === 'guardrail.checked');
				expect(rows.map((row) => trace.events[row.seq])).toEqual(raw);
				expect(verdictFlowSignature(rows)).toEqual(raw.map(signatureOf));
				checked += rows.length;
			}
			expect(checked).toBeGreaterThan(0);
		},
		TIMEOUT
	);
});
