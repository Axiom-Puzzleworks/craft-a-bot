import type { Book, BookRequest, WorkItem } from '@craftabot/core';
import { customerForTheDesk, population } from '@craftabot/pack-fs-bank';
import {
	verdictFromFigures,
	type ServiceRequest,
	type ServicingItemPayload
} from '@craftabot/pack-fs-servicing';
import { SERVICING_CORPUS, type CorpusRow } from './corpus.js';

/**
 * **The corpus as a book** (`98-JEV.md` §8): one servicing request per corpus
 * row, each from a population customer who is who they say they are, with
 * the row's words as the request and the **row's labels as the truth**
 * (`ServicingItemPayload.label`). So the regex is scored against the label
 * and not against itself.
 *
 * `size` is the population's. The book holds one item per row whatever the
 * size (the customers cycle when the population is smaller), so every
 * configuration sees the whole corpus once. The items carry no arrears, so a
 * disclosed need is recorded and not handed to collections: the handoff is
 * not what this experiment measures.
 */
export const SERVICING_JEV_KIND = 'servicing-request';

function requestFor(row: CorpusRow, given: ServiceRequest['given']): ServiceRequest {
	return {
		subject: row.text,
		given,
		authority:
			row.category === 'third-party' || row.category === 'bereavement'
				? 'power-of-attorney'
				: 'none',
		...(row.category === 'address' ? { newPostcode: 'ZZ40 2QT' } : {}),
		...(row.category === 'third-party' ? { grantee: 'the named person' } : {})
	};
}

export function corpusBook(
	request: BookRequest,
	corpus: readonly CorpusRow[] = SERVICING_CORPUS
): Book {
	const pop = population(request.seed, { size: request.size });
	const items: WorkItem[] = corpus.map((row, index) => {
		const entry = pop.customers[index % pop.customers.length]!;
		const customer = customerForTheDesk(entry.customer);
		const given = { name: customer.name.full, birthYear: customer.dateOfBirthYear };
		const request = requestFor(row, given);
		const verdict = verdictFromFigures({
			category: row.category,
			callerIsCustomer: true,
			authorityOnFile: request.authority !== 'none'
		});
		const payload: ServicingItemPayload = {
			request,
			customer,
			inArrears: false,
			discloses: row.need,
			label: { category: row.category }
		};
		const facts = {
			category: `category-${row.category}`,
			act: `act-${verdict.act}`,
			callerIsCustomer: true,
			discloses: `discloses-${row.need}`,
			corpusRow: row.id,
			difficulty: row.tag
		};
		return {
			id: `jev-${row.id}-${customer.id.replace(/^cust-/, '')}`,
			kind: SERVICING_JEV_KIND,
			customerId: customer.id,
			arrivedAt: `${pop.transactions.dateOf(pop.options.periodDays - 1)}T${String(9 + (index % 8)).padStart(2, '0')}:00:00.000Z`,
			payload,
			truth: {
				records: [
					{ id: `jev-truth-${row.id}`, kind: 'verdict', title: 'The label', fields: facts }
				],
				facts,
				cohort: {
					ageBand: entry.customer.cohort.ageBand,
					incomeBand: entry.customer.cohort.incomeBand
				}
			}
		};
	});
	return {
		schemaVersion: 1,
		kind: SERVICING_JEV_KIND,
		items,
		source: { populationDigest: pop.digest, seed: pop.seed, size: pop.options.size }
	};
}
