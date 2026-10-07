import type { ContextLevel, ContextSpec, DeskRecord } from '@craftabot/core';
import { bankExtraOf } from './extra.js';
import { bankServiceLineIds } from './lines/graph.js';
import { bankOntology, knowledgeCard } from './ontology.js';
import { bankRecords } from './records.js';

/**
 * **What a bank desk adds at a rung of the context ladder** (WP81,
 * `70-CONTEXT-AND-ONTOLOGY.md` §5): the desks' `context` hook. `relational`
 * hands over the customer's related records flat — the customer, the
 * accounts and their recent activity, the complaints, the bureau summary —
 * every one classified `personal` (the special-category record stays where
 * it was; the runtime would drop it anyway). `ontology` hands over one
 * knowledge card: the customer's neighbourhood in the bank's ontology to
 * the rung's depth, under the desk's purpose. Anything else adds nothing.
 */
export const KNOWLEDGE_CARD_RECORD = 'knowledge-card';

const ALL_KINDS: readonly string[] = ['customer', 'account', 'transactions', 'complaint', 'bureau'];

/**
 * **The relational rung per desk** (`113-RECORDING-AND-RELIABILITY.md` §12, items 12–13): the record kinds a journey has a
 * use for. A desk is not handed a record it has no business with — an advice bot a complaint about a health condition or the
 * credit file, a fraud analyst the credit file, a dispute handler a complaint. The customer, the accounts and what moves
 * through them serve every desk that handles an existing customer; the credit file belongs to lending (and to nobody else
 * here); a complaint belongs to the complaints desk, where it is the case. Onboarding's customer has no accounts yet.
 * A purpose not listed (reception, testing) keeps every kind.
 */
export const RELATIONAL_KINDS_BY_PURPOSE: Readonly<Record<string, readonly string[]>> = {
	advice: ['customer', 'account', 'transactions'],
	'fraud-operations': ['customer', 'account', 'transactions'],
	lending: ['customer', 'account', 'transactions', 'bureau'],
	complaints: ['customer', 'account', 'transactions', 'complaint'],
	onboarding: ['customer'],
	disputes: ['customer', 'account', 'transactions'],
	collections: ['customer', 'account', 'transactions'],
	servicing: ['customer', 'account', 'transactions']
};

export function bankContextRecords(
	extra: unknown,
	level: ContextLevel,
	spec: ContextSpec
): DeskRecord[] {
	// The desk hands its `extra` over; `bankExtraOf` reads a world state, so wrap it.
	const bank = bankExtraOf({ extra });
	if (!bank) return [];
	if (level === 'relational') {
		const kinds = RELATIONAL_KINDS_BY_PURPOSE[bank.purpose] ?? ALL_KINDS;
		return bankRecords(bank.bank).hidden.filter(
			(record) => kinds.includes(record.kind) && record.classification !== 'special-category'
		);
	}
	if (level === 'ontology') {
		const ontology = spec.ontology ?? { scope: 'customer' as const, depth: 1 };
		const card = knowledgeCard(
			bankOntology(bank, { lineIds: bankServiceLineIds }),
			bank.bank.customer.id,
			ontology.depth,
			bank.purpose,
			{
				scope: ontology.scope,
				...(ontology.relations ? { relations: ontology.relations } : {}),
				...(spec.budgetTokens !== undefined ? { budgetTokens: spec.budgetTokens } : {})
			}
		);
		return [
			{
				id: KNOWLEDGE_CARD_RECORD,
				kind: KNOWLEDGE_CARD_RECORD,
				title: 'Knowledge card',
				classification: 'personal',
				fields: {
					root: bank.bank.customer.id,
					scope: ontology.scope,
					depth: ontology.depth,
					text: card
				}
			}
		];
	}
	return [];
}
