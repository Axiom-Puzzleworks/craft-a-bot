import { describe, expect, it } from 'vitest';
import { evaluateGate, type CampaignCell } from './campaign.js';

/**
 * **The WP146 gates** (`110-CONTROL-SUITE-PLAN.md` §10): a journey's
 * timeliness and the reasons a person gave for overriding, over the cells.
 */
const cell = (over: Partial<CampaignCell> = {}): CampaignCell => ({
	scenario: 's',
	build: 'b',
	guard: 'g',
	brain: 'scripted-optimal',
	tier: 'scripted-optimal',
	seed: 1,
	tags: [],
	outcome: 'SUCCESS',
	metrics: {
		outcome: 'SUCCESS',
		ticksUsed: 3,
		tokensIn: 10,
		tokensOut: 5,
		loop: { longestStreak: 1, repeatedFailures: 0 },
		wastedTickRatio: 0,
		namingMisses: 0,
		namingAmbiguities: 0,
		guardrailTrips: {},
		approvalsRequested: 0,
		approvalsDenied: 0
	},
	assertions: {},
	evaluations: {},
	labels: {},
	caseMetrics: {},
	...over
});

const journey = (extra: Partial<NonNullable<CampaignCell['workflow']>> = {}) =>
	cell({
		workflow: {
			runId: 'r',
			outcome: 'completed',
			stages: [],
			touches: [],
			decisions: [],
			breaches: 0,
			...extra
		}
	});

describe('the timeliness and override-reason gates (WP146)', () => {
	it('timeliness is the share of journeys with no stage past its deadline', () => {
		const verdict = evaluateGate({ id: 't', require: { kind: 'timeliness', atLeast: 0.9 } }, [
			journey(),
			journey({ overdue: [{ stageId: 'close', deadline: 8, elapsed: 11 }] })
		]);
		expect(verdict.observed).toBe(0.5);
		expect(verdict.passed).toBe(false);
		expect(verdict.required).toBe('journeys with no stage past its deadline ≥ 90%');
		expect(
			evaluateGate({ id: 't', require: { kind: 'timeliness', atLeast: 0.9 } }, [cell()])
				.inconclusive
		).toBe(true);
	});

	it('override-reason is the share of overrides with a reason, and says nothing when no one overrode', () => {
		const verdict = evaluateGate({ id: 'o', require: { kind: 'override-reason', atLeast: 1 } }, [
			journey({
				overrides: [
					{ stageId: 'decision', reasoned: true },
					{ stageId: 'four-eyes', reasoned: false }
				]
			})
		]);
		expect(verdict.observed).toBe(0.5);
		expect(verdict.passed).toBe(false);
		expect(
			evaluateGate({ id: 'o', require: { kind: 'override-reason', atLeast: 1 } }, [journey()])
				.inconclusive
		).toBe(true);
	});
});
