import type { Book, BookRequest } from '@craftabot/core';
import { patientFrom } from '../../vet-practice/src/index.js';
import { verdictFor } from './desk.js';

/** The book: `size` patients from the seed, one case each, the rule's verdict in truth. */
export function vaccinationBook(request: BookRequest): Book {
	const items = Array.from({ length: request.size }, (_, index) => {
		const patient = patientFrom(request.seed * 100_000 + index);
		return {
			id: `vaccination-${patient.id.slice(-8)}`,
			kind: 'vaccination' as const,
			customerId: patient.id,
			arrivedAt: `2026-01-01T${String(9 + (index % 8)).padStart(2, '0')}:00:00.000Z`,
			payload: { patient },
			truth: { records: [], facts: { verdict: `should-${verdictFor(patient)}` } }
		};
	});
	return {
		schemaVersion: 1,
		kind: 'vaccination' as never,
		items: items as never,
		source: { populationDigest: 'scaffold', seed: request.seed, size: request.size }
	};
}
