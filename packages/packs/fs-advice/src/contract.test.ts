import fsBankPack from '@craftabot/pack-fs-bank';
import starterPack from '@craftabot/pack-starter';
import { describeConformance, type PackConformanceFixture } from '@craftabot/pack-testkit';
import fsAdvicePack, { ADVICE_DESK_WORLD_ID } from './index.js';

/**
 * The Advice Desk under the conformance kit (WP60): `checkDesk` over every
 * layout — tiers, purpose, the truth property over a hundred seeds after
 * each script, senses never carrying a truth-only value.
 */
const fixture: PackConformanceFixture = {
	manifest: fsAdvicePack,
	companionPacks: [starterPack, fsBankPack],
	desks: {
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
