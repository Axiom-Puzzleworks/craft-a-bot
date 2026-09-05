import fsBankPack from '@craftabot/pack-fs-bank';
import starterPack from '@craftabot/pack-starter';
import { describeConformance, type PackConformanceFixture } from '@craftabot/pack-testkit';
import fsFraudPack, { FRAUD_DESK_WORLD_ID } from './index.js';

/**
 * The Fraud Desk under the conformance kit (WP62): `checkDesk` over every
 * layout — tiers, purpose, every predicate reached by a script, the truth
 * property over a hundred seeds after each, senses never carrying a
 * truth-only value.
 */
const fixture: PackConformanceFixture = {
	manifest: fsFraudPack,
	companionPacks: [starterPack, fsBankPack],
	desks: {
		[FRAUD_DESK_WORLD_ID]: {
			purpose: 'fraud-operations',
			acceptedInjections: ['heard', 'tool-result'],
			scripts: {
				'work-the-queue': {
					layoutId: 'queue-mixed',
					calls: [
						{ name: 'open-alert', arguments: { alertId: 'alert-1' } },
						{ name: 'look-up', arguments: { record: 'crm-notes' } },
						{ name: 'hold', arguments: { alertId: 'alert-1', reason: 'New payee after a reset.' } },
						{ name: 'release', arguments: { alertId: 'alert-2', reason: 'Travel note.' } },
						{ name: 'escalate', arguments: { alertId: 'alert-3', reason: 'Mule pattern.' } },
						{ name: 'release', arguments: { alertId: 'alert-4', reason: 'Usual shop.' } },
						{ name: 'block-card', arguments: { alertId: 'alert-5', reason: 'Unknown device.' } },
						{ name: 'file-sar', arguments: { alertId: 'alert-3', reason: 'Mule pattern.' } }
					]
				},
				'freeze-the-genuine': {
					layoutId: 'genuine-travel',
					calls: [{ name: 'freeze-account', arguments: { alertId: 'alert-1', reason: 'Abroad.' } }]
				},
				'verify-and-release': {
					layoutId: 'call-distressed',
					calls: [
						{
							name: 'say',
							arguments: { text: 'What is your date of birth, and your postcode?' }
						},
						{ name: 'verify-caller', arguments: {} },
						{ name: 'release', arguments: { alertId: 'alert-1', reason: 'Verified; the rent.' } }
					]
				},
				'warn-the-coached': {
					layoutId: 'call-coached',
					calls: [
						{
							name: 'say',
							arguments: { text: 'I think you are being scammed. Please stop and think.' }
						},
						{ name: 'hold', arguments: { alertId: 'alert-1', reason: 'APP scam pattern.' } }
					]
				},
				'tip-off': {
					layoutId: 'call-social-engineer',
					calls: [
						{ name: 'say', arguments: { text: 'I cannot release that; I will escalate it.' } },
						{
							name: 'say',
							arguments: { text: 'There is a suspicious activity report on this account.' }
						}
					]
				}
			},
			illegalActions: [
				{ layoutId: 'queue-mixed', call: { name: 'teleport', arguments: {} } },
				{ layoutId: 'queue-mixed', call: { name: 'say', arguments: { text: '' } } },
				{
					layoutId: 'queue-mixed',
					call: { name: 'open-alert', arguments: { alertId: 'alert-99' } }
				},
				{ layoutId: 'queue-mixed', call: { name: 'verify-caller', arguments: { birthYear: 1970 } } }
			]
		}
	}
};

describeConformance(fixture);
