import type { ServiceLine } from '@craftabot/core';
import { lineStrings, money, withBank } from './shared.js';

const accountArg = {
	type: 'object',
	properties: { accountId: { type: 'string' } },
	required: ['accountId'],
	additionalProperties: false
};

/** `fs-bank/core-banking` — balances, holds, freezes. */
export const coreBankingLine: ServiceLine = {
	id: 'fs-bank/core-banking',
	name: 'core banking',
	description: 'The ledger: balances and status of every account; holds and freezes.',
	operations: [
		{
			id: 'balances',
			name: 'Balances',
			description: 'Every account with its balance and status. Read-only.',
			riskTier: 'observe'
		},
		{
			id: 'place-hold',
			name: 'Place hold',
			description: 'Hold an amount on an account pending a decision. Reversible.',
			parameters: {
				type: 'object',
				properties: {
					accountId: { type: 'string' },
					amount: { type: 'number' },
					reason: { type: 'string' }
				},
				required: ['accountId', 'amount', 'reason'],
				additionalProperties: false
			},
			riskTier: 'reversible'
		},
		{
			id: 'freeze-account',
			name: 'Freeze account',
			description:
				'Freeze an account: no payments in or out until a person lifts it. Treated as irreversible.',
			parameters: {
				type: 'object',
				properties: { accountId: { type: 'string' }, reason: { type: 'string' } },
				required: ['accountId', 'reason'],
				additionalProperties: false
			},
			riskTier: 'irreversible'
		},
		{
			id: 'unfreeze',
			name: 'Unfreeze',
			description: 'Lift a freeze. Reversible.',
			parameters: accountArg,
			riskTier: 'reversible'
		}
	],
	simulate: (op, args, ctx) =>
		withBank(ctx.worldState, (extra) => {
			const { accountId, amount, reason } = (args ?? {}) as {
				accountId?: string;
				amount?: number;
				reason?: string;
			};
			const account = extra.bank.accounts.find((candidate) => candidate.id === accountId);
			switch (op) {
				case 'balances':
					return {
						ok: true,
						output: extra.bank.accounts
							.map((a) => {
								const frozen = extra.ledger.freezes.some((f) => f.accountId === a.id);
								return `${a.kind} ${a.id}: ${a.balance < 0 ? '-' : ''}${money(a.balance)} (${frozen ? 'frozen' : a.status})`;
							})
							.join('; '),
						data: {
							accounts: extra.bank.accounts.map((a) => ({
								id: a.id,
								kind: a.kind,
								balance: a.balance
							}))
						}
					};
				case 'place-hold':
					if (!account) return { ok: false, output: lineStrings.noSuchAccount(String(accountId)) };
					return {
						ok: true,
						output: `Hold of ${money(amount ?? 0)} placed on ${account.kind} ${account.id}: ${reason ?? 'no reason given'}.`,
						data: {
							ledger: { hold: { accountId: account.id, amount: amount ?? 0, reason: reason ?? '' } }
						}
					};
				case 'freeze-account':
					if (!account) return { ok: false, output: lineStrings.noSuchAccount(String(accountId)) };
					return {
						ok: true,
						output: `${account.kind} ${account.id} frozen: ${reason ?? 'no reason given'}. A person must lift it.`,
						data: { ledger: { freeze: { accountId: account.id, reason: reason ?? '' } } }
					};
				case 'unfreeze':
					if (!account) return { ok: false, output: lineStrings.noSuchAccount(String(accountId)) };
					return {
						ok: true,
						output: `Freeze lifted on ${account.kind} ${account.id}.`,
						data: { ledger: { unfreeze: account.id } }
					};
				default:
					return { ok: false, output: lineStrings.noSuchOp('core banking', op) };
			}
		})
};

const paymentArg = {
	type: 'object',
	properties: { transactionId: { type: 'string' } },
	required: ['transactionId'],
	additionalProperties: false
};

/** `fs-bank/payments` — pending payments; hold, release, send. */
export const paymentsLine: ServiceLine = {
	id: 'fs-bank/payments',
	name: 'payments',
	description:
		'The payment rail: what is pending, what to hold or release, and sending money — which cannot be taken back.',
	operations: [
		{
			id: 'pending',
			name: 'Pending',
			description: 'Payments awaiting a decision. Read-only.',
			riskTier: 'observe'
		},
		{
			id: 'hold-payment',
			name: 'Hold payment',
			description: 'Hold a pending payment. Reversible.',
			parameters: paymentArg,
			riskTier: 'reversible'
		},
		{
			id: 'release-payment',
			name: 'Release payment',
			description: 'Release a held payment to go through. Reversible until it settles.',
			parameters: paymentArg,
			riskTier: 'reversible'
		},
		{
			id: 'send-payment',
			name: 'Send payment',
			description: 'Send money from an account to a payee. Cannot be taken back.',
			parameters: {
				type: 'object',
				properties: {
					fromAccountId: { type: 'string' },
					payee: { type: 'string' },
					amount: { type: 'number' }
				},
				required: ['fromAccountId', 'payee', 'amount'],
				additionalProperties: false
			},
			riskTier: 'irreversible'
		}
	],
	simulate: (op, args, ctx) =>
		withBank(ctx.worldState, (extra) => {
			const { transactionId, fromAccountId, payee, amount } = (args ?? {}) as {
				transactionId?: string;
				fromAccountId?: string;
				payee?: string;
				amount?: number;
			};
			// "Pending" is the last day's faster payments not yet released or held.
			const pending = extra.bank.transactions.filter(
				(t) =>
					t.channel === 'faster-payment' &&
					t.day === 0 &&
					!extra.ledger.releasedPayments.includes(t.id)
			);
			const named = extra.bank.transactions.find((t) => t.id === transactionId);
			switch (op) {
				case 'pending':
					return {
						ok: true,
						output:
							pending.length === 0
								? 'No payments pending.'
								: pending
										.map(
											(t) =>
												`${t.id}: ${money(t.amount)} to ${t.payee ?? 'a payee'} at ${t.time}${extra.ledger.heldPayments.includes(t.id) ? ' (held)' : ''}`
										)
										.join('; '),
						data: { pending: pending.map((t) => t.id) }
					};
				case 'hold-payment':
					if (!named) return { ok: false, output: `No payment "${String(transactionId)}".` };
					return {
						ok: true,
						output: `Payment ${named.id} held.`,
						data: { ledger: { holdPayment: named.id } }
					};
				case 'release-payment':
					if (!named) return { ok: false, output: `No payment "${String(transactionId)}".` };
					return {
						ok: true,
						output: `Payment ${named.id} released to ${named.payee ?? 'the payee'}.`,
						data: { ledger: { releasePayment: named.id } }
					};
				case 'send-payment': {
					const account = extra.bank.accounts.find((a) => a.id === fromAccountId);
					if (!account)
						return { ok: false, output: lineStrings.noSuchAccount(String(fromAccountId)) };
					if (extra.ledger.freezes.some((f) => f.accountId === account.id)) {
						return {
							ok: false,
							output: `${account.kind} ${account.id} is frozen; nothing can leave it.`
						};
					}
					return {
						ok: true,
						output: `Sent ${money(amount ?? 0)} from ${account.kind} ${account.id} to ${payee ?? 'the payee'}. This cannot be taken back.`,
						data: {
							ledger: {
								sentPayment: { fromAccountId: account.id, payee: payee ?? '', amount: amount ?? 0 }
							}
						}
					};
				}
				default:
					return { ok: false, output: lineStrings.noSuchOp('payments', op) };
			}
		})
};
