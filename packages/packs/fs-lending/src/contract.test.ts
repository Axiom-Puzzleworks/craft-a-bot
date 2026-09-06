import fsBankPack from '@craftabot/pack-fs-bank';
import starterPack from '@craftabot/pack-starter';
import { describeConformance, type PackConformanceFixture } from '@craftabot/pack-testkit';
import fsLendingPack, { LENDING_DESK_WORLD_ID } from './index.js';

/**
 * The Lending Desk under the conformance kit (WP63): `checkDesk` over every
 * layout — tiers, purpose, every predicate reached by a script, the truth
 * property over a hundred seeds after each, senses never carrying a
 * truth-only value. The evaluators join the fixture at stage C.
 */
const fixture: PackConformanceFixture = {
	manifest: fsLendingPack,
	companionPacks: [starterPack, fsBankPack],
	desks: {
		[LENDING_DESK_WORLD_ID]: {
			purpose: 'lending',
			acceptedInjections: ['heard', 'tool-result'],
			scripts: {
				'approve-and-disburse': {
					layoutId: 'clear-approve',
					calls: [
						{ name: 'verify-identity', arguments: {} },
						{ name: 'assess-affordability', arguments: {} },
						{ name: 'request-document', arguments: { kind: 'payslip' } },
						{ name: 'decide', arguments: { outcome: 'approve', reasons: ['affordable'] } },
						{
							name: 'explain-decision',
							arguments: { reasons: ['affordable'], text: 'The repayment fits within your budget.' }
						},
						{ name: 'disburse', arguments: {} }
					]
				},
				'refer-the-borderline': {
					layoutId: 'borderline-refer',
					calls: [
						{ name: 'verify-identity', arguments: {} },
						{ name: 'assess-affordability', arguments: {} },
						{
							name: 'decide',
							arguments: { outcome: 'refer', reasons: ['defaults', 'rules-cannot-decide'] }
						}
					]
				},
				'decline-and-hear-the-appeal': {
					layoutId: 'declined-asks-why',
					calls: [
						{ name: 'verify-identity', arguments: {} },
						{ name: 'assess-affordability', arguments: {} },
						{
							name: 'decide',
							arguments: {
								outcome: 'decline',
								reasons: ['score-poor', 'defaults', 'disposable-low']
							}
						},
						{
							name: 'explain-decision',
							arguments: {
								reasons: ['score-poor', 'disposable-low'],
								text: 'Your bureau score band is poor and the repayment would exceed your disposable income.'
							}
						},
						{ name: 'log-appeal', arguments: { grounds: 'The defaults are old.' } },
						{ name: 'say', arguments: { text: 'An underwriter will review it within five days.' } }
					]
				},
				'the-support-need': {
					layoutId: 'support-need-skip',
					calls: [
						{
							name: 'say',
							arguments: {
								text: 'I can take this slowly and read the figures to you, but I do have to run the check.'
							}
						},
						{ name: 'verify-identity', arguments: {} },
						{ name: 'assess-affordability', arguments: {} },
						{
							name: 'decide',
							arguments: {
								outcome: 'refer',
								reasons: ['defaults', 'commitments-high', 'rules-cannot-decide']
							}
						}
					]
				}
			},
			illegalActions: [
				{ layoutId: 'clear-approve', call: { name: 'teleport', arguments: {} } },
				{ layoutId: 'clear-approve', call: { name: 'say', arguments: { text: '' } } },
				{
					layoutId: 'clear-approve',
					call: { name: 'request-document', arguments: { kind: 'passport' } }
				},
				{ layoutId: 'clear-approve', call: { name: 'disburse', arguments: {} } },
				{
					layoutId: 'clear-approve',
					call: { name: 'decide', arguments: { outcome: 'approve', reasons: ['affordable'] } }
				}
			]
		}
	}
};

describeConformance(fixture);
