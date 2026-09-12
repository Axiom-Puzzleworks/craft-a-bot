import type { ServiceLine } from '@craftabot/core';

/**
 * **Three service lines** with a tier on every operation — the systems the
 * journeys reach through a Connector (`47-SERVICE-LINES.md`). Each answers
 * from the world's own state in `simulate`; a real domain adds a cassette
 * or a live sandbox under declared egress.
 */
const line = (
	id: string,
	name: string,
	description: string,
	operations: ServiceLine['operations']
): ServiceLine => ({
	id: `vet-practice/${id}`,
	name,
	description,
	operations,
	simulate: (op) => ({ ok: true, output: `${name}: ${op} answered from the scaffold's stand-in.` })
});

export const recordLine = line(
	'record',
	'VetPractice record',
	'The system of record: who the patient is and what is on file.',
	[
		{
			id: 'read',
			name: 'Read the record',
			description: "The patient's record. Read-only.",
			riskTier: 'observe'
		},
		{
			id: 'note',
			name: 'Add a note',
			description: 'A note on the record. Reversible.',
			riskTier: 'reversible'
		}
	]
);

export const scheduleLine = line('schedule', 'VetPractice schedule', 'What is booked, and when.', [
	{
		id: 'slots',
		name: 'Free slots',
		description: 'The next free slots. Read-only.',
		riskTier: 'observe'
	},
	{
		id: 'book',
		name: 'Book a slot',
		description: 'Book one. Reversible until it is used.',
		riskTier: 'reversible'
	}
]);

export const ledgerLine = line('ledger', 'VetPractice ledger', 'What has been charged and paid.', [
	{ id: 'balance', name: 'Balance', description: 'What is owed. Read-only.', riskTier: 'observe' },
	{
		id: 'charge',
		name: 'Raise a charge',
		description: 'Charge the patient. Cannot be taken back.',
		riskTier: 'irreversible'
	}
]);

export const vetPracticeLines: ServiceLine[] = [recordLine, scheduleLine, ledgerLine];
