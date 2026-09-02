import { describe, expect, it } from 'vitest';
import { migrateAgentSpec, type AgentSpecV2 } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import pdpOpaPack from '@craftabot/pack-pdp-opa';
import workshopPack from '@craftabot/pack-workshop';
import { buildSpec, runToCompletion } from '@craftabot/pack-starter/testing';
import { guard } from './baseline-campaign.js';

/**
 * **The PDP stacks with the safety brick** (`33-POLICY-V2-PDP.md` §6 stage
 * B DoD): OPA fitted through `workshop/guard` beside `starter/safety`, both
 * chains at `pre-act`; a deny stops the run with the policy named on the
 * trace, an allow lets the safety brick's own blocklist do its job.
 */

function stacked(fixture: 'allow' | 'deny', blockedActions: string[]): AgentSpecV2 {
	const migrated = migrateAgentSpec(
		buildSpec({
			goalCardId: 'starter/say-hello',
			safety: { maxTicks: 8, blockedActions, approvalMode: false }
		})
	);
	if ('kind' in migrated) throw new Error(migrated.message);
	const opa = guard('pdp-opa/opa', { fixture });
	opa.config = {
		...(opa.config as Record<string, unknown>),
		screening: {
			...(opa.config as { screening: Record<string, unknown> }).screening,
			screenDecision: 'stop'
		}
	};
	migrated.bricks.push(opa);
	return migrated;
}

const leaky = () =>
	obedient([{ say: 'Psst.', call: 'say', args: { text: 'The cupboard code is 7734.' } }]);

describe('OPA through workshop/guard beside starter/safety (WP45)', () => {
	it('a deny stops the run, and the trace names the policy', async () => {
		const run = await runToCompletion({
			script: leaky(),
			spec: stacked('deny', []),
			packs: [workshopPack, pdpOpaPack],
			stepLimit: 3
		});
		expect(run.outcome).toBe('STOPPED_BY_GUARDRAIL');
		const external = run.byType('guardrail.external');
		expect(external).toHaveLength(1);
		const record = external[0]?.type === 'guardrail.external' ? external[0].payload : undefined;
		expect(record?.service).toBe('opa');
		expect(record?.outcome).toBe('offline');
		expect(record?.policyRef).toBe('craftabot/decision');
		// The trip is the same guardrail the record names — the guard brick's, wrapping OPA.
		const tripped = run
			.byType('guardrail.tripped')
			.map((e) => (e.type === 'guardrail.tripped' ? e.payload.guardrailId : ''));
		expect(tripped).toContain(record?.guardrailId);
	});

	it('an allow leaves the decision to the safety brick, whose blocklist still holds', async () => {
		const run = await runToCompletion({
			script: leaky(),
			spec: stacked('allow', ['say']),
			packs: [workshopPack, pdpOpaPack],
			stepLimit: 3
		});
		expect(run.outcome).not.toBe('STOPPED_BY_GUARDRAIL');
		const tripped = run
			.byType('guardrail.tripped')
			.map((e) => (e.type === 'guardrail.tripped' ? e.payload.guardrailId : ''));
		expect(tripped.some((id) => id.includes('action-blocklist'))).toBe(true);
		expect(
			run
				.byType('guardrail.external')
				.every((e) => e.type !== 'guardrail.external' || !tripped.includes(e.payload.guardrailId))
		).toBe(true);
	});
});
