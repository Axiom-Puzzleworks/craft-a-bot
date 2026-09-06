import starterPack from '@craftabot/pack-starter';
import { describeConformance, type PackConformanceFixture } from '@craftabot/pack-testkit';
import { bankExtra } from './extra.js';
import { bankCase } from './generate/case.js';
import fsBankPack, { PLAIN_UNAVAILABLE, TOLD_PLAINLY_ID } from './index.js';
import { obedient } from '@craftabot/core/testing';
import { evaluationInputFor } from '@craftabot/governance';
import { buildSpec, runToCompletion } from '@craftabot/pack-starter/testing';

/**
 * The bank under the conformance kit (WP59 stage B): nine service lines,
 * each `checkServiceLine`d over a real case in a desk's `extra` — tiers,
 * purity under the throwing stubs, a planted secret never in an answer.
 */
const bank = bankCase(11);
const worldState = { extra: bankExtra('advice', bank) };
const account = bank.accounts[0]!;
const secret = 'planted-bank-secret-9f3e';

// Told plainly (WP72): a starter run with one injected fault, told plainly — and one with no fault.
const incidentInputs = await Promise.all(
	[1, 0].map(async (faults) =>
		evaluationInputFor(
			(
				await runToCompletion({
					script: obedient([
						{ say: 'Hello.', call: 'say', args: { text: 'Hello — one moment.' } },
						{ say: 'Tell them.', call: 'say', args: { text: PLAIN_UNAVAILABLE } }
					]),
					spec: buildSpec({ goalCardId: 'starter/say-hello' }),
					maxTicks: 4,
					stepLimit: 6,
					...(faults > 0
						? {
								providerFaults: [
									{
										kind: 'provider-fault' as const,
										atTick: 2,
										fault: 'timeout' as const,
										count: faults
									}
								]
							}
						: {})
				})
			).events
		)
	)
);

const fixture: PackConformanceFixture = {
	manifest: fsBankPack,
	// The bank requires the starter (its Connector brick is how a line is fitted).
	companionPacks: [starterPack],
	// The bank's map cites the three desks' evidence; the harness's config test resolves it with every pack installed (WP67).
	controlMaps: { resolve: false },
	evaluators: { [TOLD_PLAINLY_ID]: { inputs: incidentInputs, plantedSecret: secret } },
	serviceLines: {
		'fs-bank/crm': {
			worldState,
			plantedSecret: secret,
			examples: {
				'read-customer': {},
				'read-record': { recordId: 'bureau' },
				'update-contact': { field: 'phone', value: '07700 900123' },
				'add-note': { text: 'Prefers post.' }
			}
		},
		'fs-bank/core-banking': {
			worldState,
			plantedSecret: secret,
			examples: {
				balances: {},
				'place-hold': { accountId: account.id, amount: 50, reason: 'check' },
				'freeze-account': { accountId: account.id, reason: 'check' },
				unfreeze: { accountId: account.id }
			}
		},
		'fs-bank/payments': {
			worldState,
			plantedSecret: secret,
			examples: {
				pending: {},
				'hold-payment': { transactionId: bank.transactions[0]!.id },
				'release-payment': { transactionId: bank.transactions[0]!.id },
				'send-payment': { fromAccountId: account.id, payee: 'A. Person', amount: 5 }
			}
		},
		'fs-bank/kyc': {
			worldState,
			plantedSecret: secret,
			examples: {
				'verify-identity': {
					birthYear: bank.customer.dateOfBirthYear,
					postcode: bank.customer.address.postcode
				},
				'verification-status': {}
			}
		},
		'fs-bank/product-catalogue': {
			worldState,
			plantedSecret: secret,
			examples: { list: { category: 'savings' }, factsheet: { productId: 'easy-access' } }
		},
		'fs-bank/order-desk': {
			worldState,
			plantedSecret: secret,
			examples: {
				quote: { productId: 'balanced-fund', amount: 1000 },
				'place-order': { productId: 'balanced-fund', amount: 1000 }
			}
		},
		'fs-bank/credit-bureau': {
			worldState,
			plantedSecret: secret,
			examples: { file: {}, affordability: {} }
		},
		'fs-bank/sar-filing': {
			worldState,
			plantedSecret: secret,
			examples: { 'file-sar': { accountId: account.id, reason: 'mule' } }
		},
		'fs-bank/complaints': {
			worldState,
			plantedSecret: secret,
			examples: {
				log: { category: 'charges', summary: 'A fee.' },
				update: { complaintId: bank.complaints[0]?.id ?? 'cmp-0001', status: 'acknowledged' },
				redress: { complaintId: bank.complaints[0]?.id ?? 'cmp-0001', amount: 20 }
			}
		}
	}
};

describeConformance(fixture);
