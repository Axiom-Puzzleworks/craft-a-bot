import type { ServiceLine } from '@craftabot/core';
import { describeRecord, lineStrings, mayRead, recordsOf, withBank } from './shared.js';

/** `fs-bank/crm` — the customer record: read it, read one record by id, update a contact field, add a note. */
export const crmLine: ServiceLine = {
	id: 'fs-bank/crm',
	name: 'the CRM',
	description: 'The customer record system: who the customer is, what is on file, and notes.',
	operations: [
		{
			id: 'read-customer',
			name: 'Read customer',
			description: 'The customer’s identity and contact details. Read-only.',
			riskTier: 'observe'
		},
		{
			id: 'read-record',
			name: 'Read record',
			description:
				'One record on the customer’s file, by id. Read-only; special-category records are gated by purpose.',
			parameters: {
				type: 'object',
				properties: {
					recordId: {
						type: 'string',
						description: 'The record id, e.g. "vulnerability" or "bureau".'
					}
				},
				required: ['recordId'],
				additionalProperties: false
			},
			riskTier: 'observe'
		},
		{
			id: 'update-contact',
			name: 'Update contact',
			description: 'Change a contact field (email, phone, address). Reversible.',
			parameters: {
				type: 'object',
				properties: {
					field: { type: 'string', enum: ['email', 'phone', 'address'] },
					value: { type: 'string' }
				},
				required: ['field', 'value'],
				additionalProperties: false
			},
			riskTier: 'reversible'
		},
		{
			id: 'add-note',
			name: 'Add note',
			description: 'Add a note to the customer’s file. Reversible.',
			parameters: {
				type: 'object',
				properties: { text: { type: 'string' } },
				required: ['text'],
				additionalProperties: false
			},
			riskTier: 'reversible'
		}
	],
	simulate: (op, args, ctx) =>
		withBank(ctx.worldState, (extra) => {
			const records = recordsOf(extra);
			switch (op) {
				case 'read-customer': {
					const customer = records.find((record) => record.id === 'customer');
					return customer
						? { ok: true, output: describeRecord(customer), data: { recordId: 'customer' } }
						: { ok: false, output: lineStrings.noSuchRecord('customer') };
				}
				case 'read-record': {
					const { recordId } = (args ?? {}) as { recordId?: string };
					const record = records.find((candidate) => candidate.id === recordId);
					if (!record) return { ok: false, output: lineStrings.noSuchRecord(String(recordId)) };
					if (!mayRead(extra.purpose, record)) {
						return {
							ok: false,
							output: lineStrings.notForPurpose(extra.purpose),
							data: { gated: true }
						};
					}
					return {
						ok: true,
						output: describeRecord(record),
						data: { recordId: record.id, classification: record.classification }
					};
				}
				case 'update-contact': {
					const { field, value } = (args ?? {}) as { field?: string; value?: string };
					if (!field || !value)
						return { ok: false, output: 'A contact update needs a field and a value.' };
					return {
						ok: true,
						output: `Updated ${field} on the customer’s file.`,
						data: { ledger: { contact: { [field]: value } } }
					};
				}
				case 'add-note': {
					const { text } = (args ?? {}) as { text?: string };
					if (!text) return { ok: false, output: 'A note needs some text.' };
					return { ok: true, output: 'Note added to the file.', data: { ledger: { note: text } } };
				}
				default:
					return { ok: false, output: lineStrings.noSuchOp('the CRM', op) };
			}
		})
};
