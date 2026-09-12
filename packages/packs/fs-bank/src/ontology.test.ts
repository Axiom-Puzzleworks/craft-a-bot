import type { ToolContext } from '@craftabot/core';
import { contextSpecFor } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { bankContextRecords } from './context.js';
import { BANK_PURPOSES, bankExtra, type BankPurpose } from './extra.js';
import { bankCase } from './generate/case.js';
import { bankServiceLineIds, graphLine, PURPOSE_ALLOWS_SPECIAL_CATEGORY } from './lines/index.js';
import {
	ONTOLOGY_CLASSES,
	ONTOLOGY_RELATIONS,
	bankOntology,
	describeClass,
	knowledgeCard,
	neighbours,
	pathBetween
} from './ontology.js';
import { hasAnyDriver } from './records.js';

/**
 * **The ontology, the card and the graph line** (WP81, `70-…` §5, §7): the
 * classes carry the governance entities; a card is byte-stable per seed,
 * depth and purpose and truncates deterministically; the tenet-13 sweep —
 * no special-category instance and no `discloses` edge for a purpose that
 * may not read them, at every purpose, through the card and the line.
 */
const context = (worldState?: unknown): ToolContext => ({
	tick: 1,
	notebook: { read: () => [], append: () => undefined },
	random: () => 0.5,
	...(worldState !== undefined ? { worldState: worldState as Record<string, unknown> } : {})
});
const extraFor = (seed: number, purpose: BankPurpose) => bankExtra(purpose, bankCase(seed));
const stateFor = (seed: number, purpose: BankPurpose) => ({ extra: extraFor(seed, purpose) });

/** A customer who has disclosed something, so the special-category class has an instance. */
function disclosingSeed(): number {
	for (let seed = 1; seed < 400; seed += 1) {
		if (hasAnyDriver(bankCase(seed).customer.disclosed)) return seed;
	}
	throw new Error('no disclosing customer in 400 seeds');
}

describe('the ontology', () => {
	it('declares the twelve classes with the governance entities and purpose-bound relations', () => {
		expect(Object.keys(ONTOLOGY_CLASSES).sort()).toEqual([
			'Account',
			'Alert',
			'Application',
			'BureauFile',
			'Complaint',
			'Control',
			'Customer',
			'Decision',
			'Desk',
			'Obligation',
			'Product',
			'ServiceLine',
			'Transaction',
			'Vulnerability'
		]);
		expect(ONTOLOGY_CLASSES['Vulnerability']?.specialCategory).toBe(true);
		expect(ONTOLOGY_RELATIONS['discloses']?.purposes).toEqual([...PURPOSE_ALLOWS_SPECIAL_CATEGORY]);
		const ont = bankOntology(extraFor(1, 'lending'), { lineIds: bankServiceLineIds });
		const bank = [...ont.instances('bank')];
		expect(
			bank.some((i) => i.class === 'Obligation' && i.id === 'obligation-fca:conc:affordability')
		).toBe(true);
		expect(bank.some((i) => i.class === 'Control')).toBe(true);
		expect(bank.filter((i) => i.class === 'ServiceLine')).toHaveLength(10);
		expect([...ont.edges('bank')].some((e) => e.relation === 'evidencedBy')).toBe(true);
		expect(
			[...ont.edges('bank')].some((e) => e.relation === 'governedBy' && e.from === 'desk-lending')
		).toBe(true);
	});

	it('a knowledge card is byte-stable per seed, depth and purpose, and the budget truncates at a line with the note', () => {
		const ont = bankOntology(extraFor(7, 'advice'));
		const root = extraFor(7, 'advice').bank.customer.id;
		const card = knowledgeCard(ont, root, 1, 'advice');
		expect(card).toBe(knowledgeCard(bankOntology(extraFor(7, 'advice')), root, 1, 'advice'));
		expect(card.split('\n').some((line) => /^Customer /.test(line))).toBe(true);
		expect(knowledgeCard(ont, root, 2, 'advice').length).toBeGreaterThan(card.length);
		const short = knowledgeCard(ont, root, 2, 'advice', { budgetTokens: 30 });
		expect(short.endsWith('… [truncated to 30 tokens]')).toBe(true);
		expect(short.length).toBeLessThanOrEqual(30 * 4 + 30);
		expect(short).toBe(knowledgeCard(ont, root, 2, 'advice', { budgetTokens: 30 }));
		expect(knowledgeCard(ont, 'nobody', 1, 'advice')).toContain('Nothing about nobody');
	});

	it('never names a PAN, an IBAN or an NI number', () => {
		const extra = extraFor(3, 'advice');
		const card = knowledgeCard(bankOntology(extra), extra.bank.customer.id, 2, 'advice', {
			scope: 'bank'
		});
		expect(card).not.toContain(extra.bank.customer.niNumber);
		for (const account of extra.bank.accounts) {
			if (account.pan) expect(card).not.toContain(account.pan);
			if (account.iban) expect(card).not.toContain(account.iban);
		}
	});

	it('tenet 13: the card and the line carry no special-category instance for a purpose that may not read it, at every purpose', () => {
		const seed = disclosingSeed();
		for (const purpose of BANK_PURPOSES) {
			const extra = extraFor(seed, purpose);
			const ont = bankOntology(extra, { lineIds: bankServiceLineIds });
			const allowed = PURPOSE_ALLOWS_SPECIAL_CATEGORY.has(purpose);
			// A card never carries the special-category class, whatever the purpose: it is reached only by name.
			const card = knowledgeCard(ont, extra.bank.customer.id, 2, purpose, { scope: 'bank' });
			expect(card.includes('Vulnerability'), purpose).toBe(false);
			expect(card.includes('discloses'), purpose).toBe(false);
			expect(
				neighbours(ont, extra.bank.customer.id, purpose).some(
					(e) => e.instance.class === 'Vulnerability'
				)
			).toBe(false);
			// Asked by name — the relation that reaches it, or the record itself — the purpose decides.
			const byRelation = neighbours(ont, extra.bank.customer.id, purpose, 'discloses');
			expect(
				byRelation.some((entry) => entry.instance.class === 'Vulnerability'),
				purpose
			).toBe(allowed);
			const state = stateFor(seed, purpose);
			const asked = graphLine.simulate!('neighbours', { id: 'vulnerability' }, context(state));
			expect(asked.ok, purpose).toBe(allowed);
			if (!allowed) expect(asked.output).toContain('not available for this purpose');
			const described = graphLine.simulate!('describe', {}, context(state));
			expect(described.ok).toBe(true);
			expect(described.output.includes('Vulnerability'), purpose).toBe(false);
			// The context hook's records at every rung: never the special-category one.
			for (const level of ['relational', 'ontology'] as const) {
				const records = bankContextRecords(extra, level, contextSpecFor(level));
				expect(
					records.every((record) => record.classification !== 'special-category'),
					purpose
				).toBe(true);
			}
		}
	});

	it('the graph line answers neighbours, path and describe, and refuses an unknown operation', () => {
		const state = stateFor(2, 'lending');
		const customerId = state.extra.bank.customer.id;
		const around = graphLine.simulate!(
			'neighbours',
			{ id: customerId, relation: 'holds' },
			context(state)
		);
		expect(around.ok).toBe(true);
		expect(around.output).toContain('holds: Account account-');
		const accountId = `account-${state.extra.bank.accounts[0]!.id}`;
		const path = graphLine.simulate!('path', { from: customerId, to: accountId }, context(state));
		expect(path.ok).toBe(true);
		expect(path.output).toBe(`${customerId} —holds→ ${accountId}`);
		expect(
			graphLine.simulate!('path', { from: customerId, to: 'nowhere' }, context(state)).output
		).toContain('No path');
		const cls = graphLine.simulate!('describe', { class: 'Obligation' }, context(state));
		expect(cls.ok).toBe(true);
		expect(cls.output).toContain('Obligation:');
		expect(describeClass(bankOntology(state.extra), 'Nope')).toBeUndefined();
		expect(graphLine.simulate!('shout', {}, context(state)).ok).toBe(false);
		expect(graphLine.simulate!('neighbours', {}, context(state)).ok).toBe(false);
		expect(graphLine.simulate!('neighbours', { id: customerId }, context()).ok).toBe(false);
		expect(pathBetween(bankOntology(state.extra), customerId, customerId, 'lending')).toEqual([]);
	});

	it('the relational rung hands over the customer’s related records, the ontology rung one card', () => {
		const extra = extraFor(5, 'lending');
		const relational = bankContextRecords(extra, 'relational', contextSpecFor('relational'));
		expect(relational.map((record) => record.kind)).toEqual(
			expect.arrayContaining(['customer', 'account', 'transactions', 'bureau'])
		);
		const [card] = bankContextRecords(extra, 'ontology', {
			...contextSpecFor('ontology'),
			ontology: { scope: 'bank', depth: 2 },
			budgetTokens: 200
		});
		expect(card).toMatchObject({
			id: 'knowledge-card',
			kind: 'knowledge-card',
			classification: 'personal'
		});
		expect(String(card?.fields['text'])).toMatch(/(^|\n)Customer /);
		expect(bankContextRecords(extra, 'minimal', contextSpecFor('minimal'))).toEqual([]);
		expect(
			bankContextRecords({ nothing: true }, 'relational', contextSpecFor('relational'))
		).toEqual([]);
	});
});
