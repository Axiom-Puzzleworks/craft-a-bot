import type { ServiceLine } from '@craftabot/core';
import {
	bankOntology,
	describeClass,
	knowledgeCard,
	neighbours,
	pathBetween
} from '../ontology.js';
import { coreBankingLine, paymentsLine } from './banking.js';
import { crmLine } from './crm.js';
import {
	complaintsLine,
	creditBureauLine,
	kycLine,
	orderDeskLine,
	productCatalogueLine,
	sarFilingLine
} from './services.js';
import { lineStrings, withBank } from './shared.js';

/** The ten lines' ids, the graph's own last — what the ontology's `Desk —reaches→ ServiceLine` edges name. */
export const bankServiceLineIds: readonly string[] = [
	crmLine.id,
	coreBankingLine.id,
	paymentsLine.id,
	kycLine.id,
	productCatalogueLine.id,
	orderDeskLine.id,
	creditBureauLine.id,
	sarFilingLine.id,
	complaintsLine.id,
	'fs-bank/graph'
];

/**
 * **`fs-bank/graph`** (WP81, `70-…` §5; `64-…` §6.3.2): the bank's ontology
 * as a service line — the tenth — a bot at any rung can query: the
 * neighbours of an entity (optionally along one relation), the path
 * between two, a class described. Tier `observe`; answers from the
 * snapshot's bank under the desk's purpose, so a special-category class
 * and a purpose-bound relation are refused with the lines' own finding.
 */
export const graphLine: ServiceLine = {
	id: 'fs-bank/graph',
	name: 'the graph',
	description:
		'The bank’s ontology: what is related to what, typed — neighbours of an entity, the path between two, a class described. Read-only, under the desk’s purpose.',
	operations: [
		{
			id: 'neighbours',
			name: 'Neighbours',
			description: 'The entities one relation from an id, optionally along one relation.',
			parameters: {
				type: 'object',
				properties: { id: { type: 'string' }, relation: { type: 'string' } },
				required: ['id'],
				additionalProperties: false
			},
			riskTier: 'observe'
		},
		{
			id: 'path',
			name: 'Path',
			description: 'The shortest chain of relations between two ids.',
			parameters: {
				type: 'object',
				properties: { from: { type: 'string' }, to: { type: 'string' } },
				required: ['from', 'to'],
				additionalProperties: false
			},
			riskTier: 'observe'
		},
		{
			id: 'describe',
			name: 'Describe',
			description:
				'A class of the ontology, its attributes and relations; or the customer’s own card.',
			parameters: {
				type: 'object',
				properties: { class: { type: 'string' }, depth: { type: 'number' } },
				additionalProperties: false
			},
			riskTier: 'observe'
		}
	],
	simulate: (op, args, ctx) =>
		withBank(ctx.worldState, (extra) => {
			const ontology = bankOntology(extra, { lineIds: bankServiceLineIds });
			const purpose = extra.purpose;
			switch (op) {
				case 'neighbours': {
					const { id, relation } = (args ?? {}) as { id?: string; relation?: string };
					if (!id) return { ok: false, output: 'neighbours wants an id.' };
					const found = neighbours(ontology, id, purpose, relation);
					if (found.length === 0) {
						const cls = [...ontology.instances('bank')].find((i) => i.id === id)?.class;
						if (cls && ontology.classes[cls]?.specialCategory)
							return { ok: false, output: lineStrings.notForPurpose(purpose) };
						return {
							ok: true,
							output: `Nothing is related to ${id}${relation ? ` by ${relation}` : ''}.`,
							data: []
						};
					}
					return {
						ok: true,
						output: found
							.map((entry) => `${entry.relation}: ${entry.instance.class} ${entry.instance.id}`)
							.join('; '),
						data: found.map((entry) => ({ relation: entry.relation, ...entry.instance }))
					};
				}
				case 'path': {
					const { from, to } = (args ?? {}) as { from?: string; to?: string };
					if (!from || !to) return { ok: false, output: 'path wants from and to.' };
					const chain = pathBetween(ontology, from, to, purpose);
					if (!chain)
						return {
							ok: true,
							output: `No path from ${from} to ${to} for this purpose.`,
							data: []
						};
					return {
						ok: true,
						output: chain.map((edge) => `${edge.from} —${edge.relation}→ ${edge.to}`).join('; '),
						data: chain
					};
				}
				case 'describe': {
					const { class: name, depth } = (args ?? {}) as { class?: string; depth?: number };
					if (name) {
						const text = describeClass(ontology, name);
						return text
							? { ok: true, output: text, data: ontology.classes[name] }
							: { ok: false, output: `No class "${name}" in the ontology.` };
					}
					const card = knowledgeCard(ontology, extra.bank.customer.id, depth ?? 1, purpose);
					return {
						ok: true,
						output: card,
						data: { root: extra.bank.customer.id, depth: depth ?? 1 }
					};
				}
				default:
					return { ok: false, output: lineStrings.noSuchOp('the graph', op) };
			}
		})
};
