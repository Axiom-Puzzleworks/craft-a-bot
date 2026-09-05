import {
	CASSETTE_MISS,
	replayFromCassette,
	serviceLineTools,
	type ServiceLine,
	type ToolContext
} from '@craftabot/core';
import Ajv2020 from 'ajv/dist/2020.js';
import type { ConformanceIssue, ServiceLineConformanceFixture } from '../types.js';

const ajv = new Ajv2020({ strict: false });

/**
 * **`checkServiceLine`** (WP58 stage B, `47-SERVICE-LINES.md` §4.3) — what
 * every line a pack ships must satisfy:
 *
 * - `serviceLine.operation-tier`: every operation names a `riskTier`; a
 *   `failureChance` is within 0..1; `parameters`, when present, compiles.
 * - `serviceLine.simulate-pure`: `simulate` twice with identically seeded
 *   contexts gives identical results, with the clock and every source of
 *   platform randomness replaced by throwing stubs for the duration.
 * - `serviceLine.cassette-replays`: every recorded entry replays to its own
 *   result twice, byte-identical; a changed argument replays to nothing.
 * - `serviceLine.no-live-in-replay`: the synthesised tool for a recorded
 *   line answers a miss — `errorKind: 'cassette-miss'` — under a throwing
 *   `fetch` planted on `globalThis`, and never throws.
 * - `serviceLine.live-declares-egress`: a `live` block declares at least one
 *   host with a purpose.
 * - `serviceLine.no-secret-leaks`: `live.call` against a refusing `fetch`
 *   with a planted credential never puts the secret in its result; a
 *   cassette's entries never contain it either.
 */
export async function checkServiceLine(
	line: ServiceLine,
	fixture: ServiceLineConformanceFixture = {}
): Promise<ConformanceIssue[]> {
	const issues: ConformanceIssue[] = [];
	const packId = fixture.packId ?? line.id.slice(0, Math.max(0, line.id.indexOf('/')));

	for (const operation of line.operations) {
		if (operation.riskTier === undefined) {
			issues.push({
				check: 'serviceLine.operation-tier',
				message: `operation "${operation.id}" of "${line.id}" names no riskTier`
			});
		}
		if (
			operation.failureChance !== undefined &&
			(operation.failureChance < 0 ||
				operation.failureChance > 1 ||
				Number.isNaN(operation.failureChance))
		) {
			issues.push({
				check: 'serviceLine.operation-tier',
				message: `operation "${operation.id}" of "${line.id}" has a failureChance outside 0..1`
			});
		}
		if (operation.parameters !== undefined) {
			try {
				ajv.compile(operation.parameters);
			} catch (error) {
				issues.push({
					check: 'serviceLine.operation-tier',
					message: `operation "${operation.id}" of "${line.id}" has parameters Ajv cannot compile: ${describe(error)}`
				});
			}
		}
	}

	if (line.simulate) checkSimulatePure(line, fixture, issues);

	if (line.cassette) {
		for (const entry of line.cassette.entries) {
			const first = await replayFromCassette(line.cassette, entry.op, entry.args);
			const second = await replayFromCassette(line.cassette, entry.op, entry.args);
			if (
				JSON.stringify(first) !== JSON.stringify(entry.result) ||
				JSON.stringify(first) !== JSON.stringify(second)
			) {
				issues.push({
					check: 'serviceLine.cassette-replays',
					message: `"${line.id}": the entry for "${entry.op}" does not replay to its own result twice`
				});
				break;
			}
		}
		const changed = await replayFromCassette(line.cassette, line.cassette.entries[0]?.op ?? 'x', {
			__not: 'recorded'
		});
		if (changed !== undefined) {
			issues.push({
				check: 'serviceLine.cassette-replays',
				message: `"${line.id}" replays an answer for arguments it never recorded`
			});
		}
		await checkNoLiveInReplay(packId, line, issues);
		const planted = fixture.plantedSecret;
		if (planted && JSON.stringify(line.cassette).includes(planted)) {
			issues.push({
				check: 'serviceLine.no-secret-leaks',
				message: `"${line.id}"'s cassette carries the planted secret`
			});
		}
	}

	if (line.live) {
		if (
			line.live.egress.length === 0 ||
			line.live.egress.some((declaration) => !declaration.host || !declaration.purpose)
		) {
			issues.push({
				check: 'serviceLine.live-declares-egress',
				message: `"${line.id}" has a live client that declares no egress host with a purpose`
			});
		}
		await checkLiveLeaks(line, fixture, issues);
	}

	return issues;
}

function stubContext(seed: number): ToolContext {
	let state = seed || 1;
	const random = () => {
		state = (state * 1103515245 + 12345) & 0x7fffffff;
		return state / 0x7fffffff;
	};
	return { tick: 0, notebook: { read: () => [], append: () => undefined }, random };
}

function checkSimulatePure(
	line: ServiceLine,
	fixture: ServiceLineConformanceFixture,
	issues: ConformanceIssue[]
): void {
	const examples =
		fixture.examples ?? Object.fromEntries(line.operations.map((operation) => [operation.id, {}]));
	const globals = globalThis as unknown as Record<string, unknown>;
	const names = ['Date', 'crypto', 'performance'] as const;
	const saved = Object.fromEntries(
		names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
	) as Record<(typeof names)[number], PropertyDescriptor | undefined>;
	const savedRandom = Math.random;
	const refuse = (what: string) => () => {
		throw new Error(`the line reached for ${what}`);
	};
	const FakeDate = new Proxy(globals['Date'] as object, {
		construct: refuse('the clock (new Date)'),
		apply: refuse('the clock (Date())'),
		get: (target, property) =>
			property === 'now' ? refuse('the clock (Date.now)') : Reflect.get(target, property)
	});
	const trap = (label: string) =>
		new Proxy({}, { get: (_target, property) => refuse(`${label}.${String(property)}`) });
	const install = (name: (typeof names)[number], value: unknown) =>
		Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
	try {
		install('Date', FakeDate);
		install('crypto', trap('crypto'));
		install('performance', trap('performance'));
		Math.random = refuse('Math.random');
		for (const [op, args] of Object.entries(examples)) {
			try {
				const ctx = (seed: number) => ({
					random: stubContext(seed).random,
					...(fixture.worldState !== undefined ? { worldState: fixture.worldState } : {})
				});
				const a = line.simulate!(op, args, ctx(7));
				const b = line.simulate!(op, args, ctx(7));
				if (JSON.stringify(a) !== JSON.stringify(b)) {
					issues.push({
						check: 'serviceLine.simulate-pure',
						message: `"${line.id}".simulate("${op}") differs between two identically seeded runs`
					});
				}
			} catch (error) {
				issues.push({
					check: 'serviceLine.simulate-pure',
					message: `"${line.id}".simulate("${op}"): ${describe(error)}`
				});
			}
		}
	} finally {
		Math.random = savedRandom;
		for (const name of names) {
			const descriptor = saved[name];
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globals[name];
		}
	}
}

async function checkNoLiveInReplay(
	packId: string,
	line: ServiceLine,
	issues: ConformanceIssue[]
): Promise<void> {
	if (line.simulate) return;
	const [tool] = serviceLineTools(packId, line);
	if (!tool) return;
	const savedFetch = globalThis.fetch;
	globalThis.fetch = (() => {
		throw new Error('a replay must never call out');
	}) as typeof fetch;
	try {
		const miss = await tool.execute({ __not: 'recorded' }, stubContext(1));
		if (miss.ok || miss.errorKind !== CASSETTE_MISS) {
			issues.push({
				check: 'serviceLine.no-live-in-replay',
				message: `"${line.id}" answered unrecorded arguments with something other than a cassette miss`
			});
		}
	} catch (error) {
		issues.push({
			check: 'serviceLine.no-live-in-replay',
			message: `"${line.id}" threw on unrecorded arguments: ${describe(error)}`
		});
	} finally {
		globalThis.fetch = savedFetch;
	}
}

async function checkLiveLeaks(
	line: ServiceLine,
	fixture: ServiceLineConformanceFixture,
	issues: ConformanceIssue[]
): Promise<void> {
	const planted = fixture.plantedSecret ?? 'planted-secret-for-the-line';
	const op = line.operations[0]?.id ?? 'x';
	try {
		const result = await line.live!.call(op, fixture.examples?.[op] ?? {}, {
			fetch: () => Promise.reject(new Error(`no network in conformance (${planted})`)),
			getCredential: () => planted
		});
		if (JSON.stringify(result).includes(planted)) {
			issues.push({
				check: 'serviceLine.no-secret-leaks',
				message: `"${line.id}".live.call let the credential into its result`
			});
		}
	} catch (error) {
		if (describe(error).includes(planted)) {
			issues.push({
				check: 'serviceLine.no-secret-leaks',
				message: `"${line.id}".live.call let the credential into an error`
			});
		}
	}
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
