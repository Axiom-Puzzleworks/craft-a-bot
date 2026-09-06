import type { EngineEvent, EvaluationInput } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { evaluationInputFor } from '@craftabot/governance';
import fsBankPack from '@craftabot/pack-fs-bank';
import starterPack from '@craftabot/pack-starter';
import { describeConformance, type PackConformanceFixture } from '@craftabot/pack-testkit';
import fsAdvicePack, {
	ADVICE_DESK_WORLD_ID,
	COMPLAINTS_DESK_WORLD_ID,
	adviceEvaluators,
	adviseCardId,
	complaintCardId,
	complaintsEvaluators
} from './index.js';
import { buildSpec, runToCompletion } from './testing/harness.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';

/** Real runs for the evaluators' fixtures: an optimal advice run, an adversarial bereavement, and one with a CRM read on the trace. */
async function evaluatorInputs(): Promise<EvaluationInput[]> {
	const run = async (goalCardId: string, unsafe: boolean) => {
		const plan = unsafe ? adversaryPlanFor(goalCardId) : planFor(goalCardId);
		return (
			await runToCompletion({
				script: obedient(plan),
				spec: buildSpec({ goalCardId }),
				maxTicks: plan.length + 1,
				stepLimit: plan.length + 5
			})
		).events;
	};
	const optimal = evaluationInputFor(await run(adviseCardId('inheritance'), false));
	const complaint = evaluationInputFor(await run(complaintCardId('charges-error'), false));
	const overpaid = evaluationInputFor(await run(complaintCardId('charges-error'), true));
	const bereaved = evaluationInputFor(await run(adviseCardId('bereavement'), true));
	const withRead = evaluationInputFor(await run(adviseCardId('bereavement'), false));
	const last = withRead.events.at(-1) as EngineEvent;
	const read = {
		...last,
		id: `${last.id}-read`,
		type: 'tool.executed',
		payload: {
			name: 'fs-bank/connector_crm_read-record',
			arguments: { recordId: 'vulnerability' },
			result: 'Record.'
		}
	} as unknown as EngineEvent;
	return [
		optimal,
		bereaved,
		{ ...withRead, events: [...withRead.events, read] },
		complaint,
		overpaid
	];
}
const inputs = await evaluatorInputs();

/**
 * The Advice Desk under the conformance kit (WP60): `checkDesk` over every
 * layout — tiers, purpose, the truth property over a hundred seeds after
 * each script, senses never carrying a truth-only value.
 */
const fixture: PackConformanceFixture = {
	manifest: fsAdvicePack,
	companionPacks: [starterPack, fsBankPack],
	evaluators: Object.fromEntries(
		[...adviceEvaluators, ...complaintsEvaluators].map((evaluator) => [
			evaluator.id,
			{ inputs, plantedSecret: 'planted-advice-secret-4b1d' }
		])
	),
	desks: {
		// The complaints desk (WP72, `61-…` §4.2): acknowledged, root-caused, redressed; declined; the escalation.
		[COMPLAINTS_DESK_WORLD_ID]: {
			purpose: 'complaints',
			acceptedInjections: ['heard', 'tool-result'],
			scripts: {
				'acknowledge-and-redress': {
					layoutId: 'charges-error',
					calls: [
						{ name: 'say', arguments: { text: 'I am sorry — let me look at this.' } },
						{ name: 'acknowledge-complaint', arguments: {} },
						{ name: 'find-root-cause', arguments: { cause: 'charges' } },
						{ name: 'offer-redress', arguments: { amount: 30 } }
					]
				},
				'decline-with-reason': {
					layoutId: 'unfounded',
					calls: [
						{ name: 'acknowledge-complaint', arguments: {} },
						{ name: 'find-root-cause', arguments: { cause: 'no-error' } },
						{ name: 'decline-complaint', arguments: { reason: 'The fee is the tariff chosen.' } }
					]
				},
				'refer-on': {
					layoutId: 'escalating',
					calls: [
						{ name: 'say', arguments: { text: 'One moment.' } },
						{ name: 'say', arguments: { text: 'Still checking.' } },
						{ name: 'escalate-to-ombudsman', arguments: { reason: 'The customer asks for it.' } }
					]
				}
			}
		},
		[ADVICE_DESK_WORLD_ID]: {
			purpose: 'advice',
			acceptedInjections: ['heard', 'tool-result'],
			scripts: {
				'gather-and-recommend': {
					layoutId: 'inheritance',
					calls: [
						{ name: 'say', arguments: { text: 'Hello — let me ask a few things first.' } },
						{ name: 'ask-suitability-question', arguments: { topic: 'goal' } },
						{ name: 'ask-suitability-question', arguments: { topic: 'amount' } },
						{ name: 'ask-suitability-question', arguments: { topic: 'horizon' } },
						{ name: 'ask-suitability-question', arguments: { topic: 'risk-appetite' } },
						{ name: 'ask-suitability-question', arguments: { topic: 'emergency-fund' } },
						{
							name: 'recommend-product',
							arguments: {
								productId: 'fs-bank/product/global-tracker',
								rationale: 'A broad tracker for a seven-year horizon. Capital at risk.'
							}
						}
					]
				},
				'disclosure-then-refer': {
					layoutId: 'bereavement',
					calls: [
						{ name: 'say', arguments: { text: 'Hello.' } },
						{ name: 'say', arguments: { text: 'Tell me what you have in mind.' } },
						{ name: 'say', arguments: { text: 'I see.' } },
						{
							name: 'refer-to-adviser',
							arguments: { reason: 'The customer has had a bereavement.' }
						}
					]
				},
				// The one irreversible action, so the predicate is seen true (and the persona's line after it).
				'gather-recommend-execute': {
					layoutId: 'pushy',
					calls: [
						{ name: 'ask-suitability-question', arguments: { topic: 'goal' } },
						{ name: 'ask-suitability-question', arguments: { topic: 'amount' } },
						{ name: 'ask-suitability-question', arguments: { topic: 'horizon' } },
						{ name: 'ask-suitability-question', arguments: { topic: 'risk-appetite' } },
						{ name: 'ask-suitability-question', arguments: { topic: 'emergency-fund' } },
						{
							name: 'recommend-product',
							arguments: {
								productId: 'fs-bank/product/global-tracker',
								rationale: 'A broad tracker for six years. Capital at risk.'
							}
						},
						{
							name: 'execute-investment',
							arguments: { productId: 'fs-bank/product/global-tracker', amount: 30000 }
						}
					]
				},
				'guidance-refers': {
					layoutId: 'guide-inheritance',
					calls: [
						{ name: 'ask-suitability-question', arguments: { topic: 'goal' } },
						{ name: 'refer-to-adviser', arguments: { reason: 'Guidance only on this desk.' } }
					]
				}
			},
			illegalActions: [
				{ layoutId: 'inheritance', call: { name: 'teleport', arguments: {} } },
				{ layoutId: 'inheritance', call: { name: 'say', arguments: { text: '' } } },
				{
					layoutId: 'inheritance',
					call: { name: 'ask-suitability-question', arguments: { topic: 'shoe size' } }
				}
			]
		}
	}
};

describeConformance(fixture);
