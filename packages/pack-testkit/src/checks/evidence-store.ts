import {
	describeEvidenceStoreProblems,
	verifyEvidenceItem,
	type EvidenceItem,
	type EvidenceStore
} from '@craftabot/core';
import type { ConformanceIssue, EvidenceStoreConformanceFixture } from '../types.js';

/**
 * **`checkEvidenceStore`** (`58-EVIDENCE-STORE.md` §4.2, WP70): a store is a
 * sync target that answers. Given a fixture's items, a store that never
 * calls out must round-trip every one — push, verify the receipt, pull it
 * back byte-for-byte with its digest intact, say `false` for a receipt whose
 * digest is wrong — and a store that does call out, handed a `fetch` that
 * refuses, must reject `push` with a message that carries no credential and
 * reject `verify` rather than answer. A store that resolves a push with no
 * network, or leaks the planted secret into a message, is what this catches.
 */
export async function checkEvidenceStore(
	store: EvidenceStore,
	fixture: EvidenceStoreConformanceFixture
): Promise<ConformanceIssue[]> {
	const issues: ConformanceIssue[] = [];
	for (const problem of describeEvidenceStoreProblems(store)) {
		issues.push({ check: 'evidence.shape', message: `"${store.id}" ${problem}` });
	}
	if (issues.length > 0) return issues;

	const parsed = store.configSchema.safeParse(fixture.config);
	if (!parsed.success) {
		issues.push({
			check: 'evidence.config',
			message: `"${store.id}" refuses its own fixture config: ${parsed.error.issues[0]?.message ?? 'invalid'}`
		});
		return issues;
	}
	for (const declaration of store.egress(fixture.config)) {
		if (typeof declaration.host !== 'string' || declaration.host === '') {
			issues.push({
				check: 'evidence.egress',
				message: `"${store.id}" declares an egress without a host`
			});
		}
	}
	if (fixture.items.length === 0) {
		issues.push({ check: 'evidence.fixture', message: 'the fixture has no items to round-trip' });
		return issues;
	}
	for (const item of fixture.items) {
		if (!(await verifyEvidenceItem(item))) {
			issues.push({
				check: 'evidence.fixture',
				message: `the fixture's ${item.kind} "${item.id}" does not verify — the suite would prove nothing`
			});
		}
	}
	if (issues.length > 0) return issues;

	const refusing: typeof globalThis.fetch = () =>
		Promise.reject(new Error(`no network in conformance (${fixture.plantedSecret})`));
	let instance;
	try {
		instance = store.create({
			config: parsed.data,
			fetch: refusing,
			getCredential: () => fixture.plantedSecret,
			now: () => Date.UTC(2026, 0, 1)
		});
	} catch (error) {
		issues.push({
			check: 'evidence.create',
			message: `"${store.id}" threw from create(): ${(error as Error).message}`
		});
		return issues;
	}

	if (fixture.expectsNetwork === false) {
		for (const item of fixture.items) {
			let receipt;
			try {
				receipt = await instance.push(item);
			} catch (error) {
				issues.push({
					check: 'evidence.push',
					message: `"${store.id}" rejected a push of ${item.kind} "${item.id}": ${(error as Error).message}`
				});
				continue;
			}
			if (receipt.id !== item.id || receipt.kind !== item.kind || receipt.digest !== item.digest) {
				issues.push({
					check: 'evidence.receipt',
					message: `"${store.id}" receipted ${item.kind} "${item.id}" as ${receipt.kind} "${receipt.id}" at ${receipt.digest.slice(0, 8)}`
				});
			}
			if (!(await instance.verify(receipt))) {
				issues.push({
					check: 'evidence.verify',
					message: `"${store.id}" does not verify the receipt it just gave for "${item.id}"`
				});
			}
			const wrong = {
				...receipt,
				digest: (receipt.digest[0] === '0' ? '1' : '0') + receipt.digest.slice(1)
			};
			if (await instance.verify(wrong)) {
				issues.push({
					check: 'evidence.verify',
					message: `"${store.id}" verifies a receipt with the wrong digest for "${item.id}"`
				});
			}
			const pulled: EvidenceItem[] = [];
			for await (const back of instance.pull({ kind: item.kind, id: item.id })) pulled.push(back);
			const match = pulled.find((back) => back.id === item.id);
			if (!match) {
				issues.push({
					check: 'evidence.pull',
					message: `"${store.id}" does not pull back ${item.kind} "${item.id}"`
				});
			} else if (
				JSON.stringify(match.payload) !== JSON.stringify(item.payload) ||
				match.digest !== item.digest ||
				!(await verifyEvidenceItem(match))
			) {
				issues.push({
					check: 'evidence.pull',
					message: `"${store.id}" pulls ${item.kind} "${item.id}" back changed`
				});
			}
		}
		const all: EvidenceItem[] = [];
		for await (const back of instance.pull({})) all.push(back);
		if (all.length < fixture.items.length) {
			issues.push({
				check: 'evidence.pull',
				message: `"${store.id}" pulls ${all.length} of ${fixture.items.length} items with an empty query`
			});
		}
		return issues;
	}

	const first = fixture.items[0] as EvidenceItem;
	const messages: string[] = [];
	try {
		await instance.push(first);
		issues.push({
			check: 'evidence.push',
			message: `"${store.id}" resolved a push with no network — it did not try to send`
		});
	} catch (error) {
		messages.push((error as Error).message);
	}
	try {
		await instance.verify({
			storeId: store.id,
			workspace: 'conformance',
			kind: first.kind,
			id: first.id,
			digest: first.digest,
			storedAt: '2026-01-01T00:00:00.000Z'
		});
		issues.push({
			check: 'evidence.verify',
			message: `"${store.id}" answered verify() with no network — it must reject when unreachable`
		});
	} catch (error) {
		messages.push((error as Error).message);
	}
	try {
		for await (const item of instance.pull({})) void item;
		issues.push({
			check: 'evidence.pull',
			message: `"${store.id}" completed a pull with no network`
		});
	} catch (error) {
		messages.push((error as Error).message);
	}
	if (messages.some((text) => text.includes(fixture.plantedSecret))) {
		issues.push({
			check: 'evidence.secret',
			message: `"${store.id}" carries the credential in an error it reports`
		});
	}
	return issues;
}
