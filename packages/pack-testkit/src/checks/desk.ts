import {
	isDeskWorldState,
	type DeskRecord,
	type DeskWorldState,
	type Injection,
	type WorldDefinition,
	type WorldInstance
} from '@craftabot/core';
import type {
	ConformanceIssue,
	DeskConformanceFixture,
	WorldIllegalCallFixture,
	WorldScriptFixture
} from '../types.js';
import { checkWorld } from './world.js';

/**
 * **`checkDesk`** (WP53 stage C, `43-DESK-WORLDS.md` §4.8) — what every world
 * with `view: 'desk'` must satisfy, over and above `checkWorld`:
 *
 * - `desk.snapshot-shape`: every layout's snapshot is a `DeskWorldState` by
 *   core's own guard, with its four lists present.
 * - `desk.action-tier`: every action names a `riskTier` — a desk never
 *   leaves how consequential a thing is unsaid.
 * - `desk.perform-pure`: creating, observing and performing never read the
 *   clock or the platform's randomness — proved by replacing `Date`,
 *   `Math.random`, `crypto` and `performance` with throwing stubs for the
 *   duration of the fixture's scripts, the way the egress guard's throwing
 *   `fetch` proves a network call never happened.
 * - `desk.injections`: `inject` exists, never throws for any of the four
 *   kinds, changes the desk for a kind the fixture says it accepts and
 *   leaves it alone for one it does not.
 * - `desk.purpose-classification`: a `special-category` record is never in
 *   the opening snapshot or a sense's text on a desk that declares no
 *   `purpose`. The first cut — WP54's truth property is the real gate.
 * - `desk.reset-identical`: `reset()` returns the desk to the state a fresh
 *   `create` of the same layout gives.
 * - `desk.truth-never-sensed` (WP54, `45-TRUTH-SYNTHETIC.md` §4.3, tenet 13):
 *   over a hundred seeds, no sense's text and no progress line contains a
 *   value only `truth()` knows — a leaf of a truth record or fact that no
 *   revealed or hidden record carries — at the opening and after every
 *   fixture script. A desk with no `truth` passes trivially.
 * - `desk.truth-not-in-snapshot` (WP54): the snapshot never carries such a
 *   value either — truth lives beside the state, never in it.
 *
 * Runs `checkWorld` first when the fixture carries scripts, so a desk is a
 * conforming world before it is a conforming desk.
 */
export function checkDesk(
	world: WorldDefinition,
	fixture: DeskConformanceFixture = {}
): ConformanceIssue[] {
	const issues: ConformanceIssue[] = [];
	const layoutIds = fixture.layoutIds ?? world.layouts.map((layout) => layout.id);
	const scripts = fixture.scripts ?? {};
	const illegalActions = fixture.illegalActions ?? [];
	const volatile = fixture.volatileStateKeys ?? ['tick', 'heardCursor'];

	if (world.view !== 'desk') {
		issues.push({
			check: 'desk.view',
			message: `world "${world.id}" is not a desk (view is ${JSON.stringify(world.view ?? 'grid')})`
		});
		return issues;
	}

	if (Object.keys(scripts).length > 0 || illegalActions.length > 0) {
		issues.push(
			...checkWorld(world, {
				worldId: world.id,
				scripts,
				illegalActions,
				volatileStateKeys: volatile
			})
		);
	}

	for (const action of world.actions) {
		if (action.riskTier === undefined) {
			issues.push({
				check: 'desk.action-tier',
				message: `action "${action.id}" names no riskTier — a desk never leaves it unsaid`
			});
		}
	}

	const purpose = fixture.purpose ?? purposeOf(world);

	for (const layoutId of layoutIds) {
		let instance: WorldInstance;
		try {
			instance = world.create(layoutId);
		} catch (error) {
			issues.push({
				check: 'desk.layout-loads',
				message: `layout "${layoutId}" failed to create: ${describeError(error)}`
			});
			continue;
		}

		const opening = instance.snapshot();
		if (!isDeskWorldState(opening)) {
			issues.push({
				check: 'desk.snapshot-shape',
				message: `layout "${layoutId}" snapshots something that is not a DeskWorldState`
			});
			continue;
		}
		checkPurpose(world, instance, opening, purpose, layoutId, issues);
		checkReset(world, instance, layoutId, volatile, issues);
		checkInjections(instance, fixture.acceptedInjections, issues);
	}

	checkPurity(world, layoutIds, scripts, issues);
	checkTruth(world, layoutIds, scripts, issues);

	return issues;
}

/** How many seeds the truth property runs over (`45-…` §4.3). */
const TRUTH_SEEDS = 100;

/**
 * mulberry32, eleven lines, so the kit can hand a desk a seeded `random`
 * without depending on `@craftabot/desk` (the kit tests the contract, not
 * the runtime).
 */
function seededRandom(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Every string, number and boolean leaf under a value, stringified. */
function leaves(value: unknown, out: string[] = []): string[] {
	if (value === null || value === undefined) return out;
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		out.push(String(value));
		return out;
	}
	if (Array.isArray(value)) {
		for (const entry of value) leaves(entry, out);
		return out;
	}
	if (typeof value === 'object') {
		for (const entry of Object.values(value as Record<string, unknown>)) leaves(entry, out);
	}
	return out;
}

/**
 * The values only truth knows: leaves of the truth block that no revealed or
 * hidden record carries. Short values (under three characters) and the two
 * booleans are compared as whole leaves rather than substrings — `true`
 * appears in most sentences' worth of JSON, and `7` in every trace.
 */
function truthOnlyValues(truth: unknown, state: DeskWorldState): string[] {
	const known = new Set(
		leaves([...state.records, ...((state as { hidden?: DeskRecord[] }).hidden ?? [])])
	);
	return [...new Set(leaves(truth))].filter(
		(value) => value.length >= 3 && value !== 'true' && value !== 'false' && !known.has(value)
	);
}

function checkTruth(
	world: WorldDefinition,
	layoutIds: readonly string[],
	scripts: Record<string, WorldScriptFixture>,
	issues: ConformanceIssue[]
): void {
	const channels = world.senses.map((sense) => sense.id);
	const predicates = Object.keys(world.predicates);
	for (const layoutId of layoutIds) {
		const probe = world.create(layoutId);
		if (typeof probe.truth !== 'function') continue;
		for (let seed = 1; seed <= TRUTH_SEEDS; seed += 1) {
			const instance = world.create(layoutId, { random: seededRandom(seed) });
			const runs: Array<{ label: string; calls: WorldScriptFixture['calls'] }> = [
				{ label: 'the opening', calls: [] },
				...Object.entries(scripts)
					.filter(([, script]) => script.layoutId === layoutId)
					.map(([name, script]) => ({ label: `after script "${name}"`, calls: script.calls }))
			];
			for (const run of runs) {
				instance.reset();
				for (const call of run.calls) instance.perform(call);
				const snapshot = instance.snapshot();
				if (!isDeskWorldState(snapshot)) return;
				const secrets = truthOnlyValues(instance.truth?.(), snapshot);
				if (secrets.length === 0) continue;
				const leakedInSnapshot = secrets.filter((secret) =>
					JSON.stringify(snapshot).includes(secret)
				);
				if (leakedInSnapshot.length > 0) {
					issues.push({
						check: 'desk.truth-not-in-snapshot',
						message: `layout "${layoutId}", seed ${seed}, ${run.label}: the snapshot carries truth-only value(s) ${leakedInSnapshot
							.map((value) => JSON.stringify(value))
							.join(', ')}`
					});
					return;
				}
				const texts: Array<{ where: string; text: string }> = [
					...channels.map((channel) => ({
						where: `sense "${channel}"`,
						text: instance.observe([channel]).text
					})),
					...predicates.map((predicate) => ({
						where: `progress for "${predicate}"`,
						text: instance.describeProgress?.(predicate, channels) ?? ''
					}))
				];
				for (const { where, text } of texts) {
					const leaked = secrets.filter((secret) => text.includes(secret));
					if (leaked.length > 0) {
						issues.push({
							check: 'desk.truth-never-sensed',
							message: `layout "${layoutId}", seed ${seed}, ${run.label}: ${where} reveals truth-only value(s) ${leaked
								.map((value) => JSON.stringify(value))
								.join(', ')}`
						});
						return;
					}
				}
			}
		}
	}
}

/** `createDeskWorld` leaves its spec on the definition; a hand-written desk may carry `purpose` itself. */
function purposeOf(world: WorldDefinition): string | undefined {
	const candidate = world as { spec?: { purpose?: unknown }; purpose?: unknown };
	const value = candidate.spec?.purpose ?? candidate.purpose;
	return typeof value === 'string' ? value : undefined;
}

function specialCategory(records: readonly DeskRecord[]): DeskRecord[] {
	return records.filter((record) => record.classification === 'special-category');
}

function checkPurpose(
	world: WorldDefinition,
	instance: WorldInstance,
	opening: DeskWorldState,
	purpose: string | undefined,
	layoutId: string,
	issues: ConformanceIssue[]
): void {
	if (purpose !== undefined) return;
	const everything = [
		...opening.records,
		...(((opening as { hidden?: DeskRecord[] }).hidden ?? []) as DeskRecord[])
	];
	const sensitive = specialCategory(everything);
	if (sensitive.length === 0) return;

	const revealedAtStart = specialCategory(opening.records);
	if (revealedAtStart.length > 0) {
		issues.push({
			check: 'desk.purpose-classification',
			message: `layout "${layoutId}" opens with special-category record(s) ${revealedAtStart
				.map((record) => `"${record.id}"`)
				.join(', ')} revealed, and the desk declares no purpose`
		});
	}
	for (const sense of world.senses) {
		const text = instance.observe([sense.id]).text;
		for (const record of sensitive) {
			if (text.includes(record.title)) {
				issues.push({
					check: 'desk.purpose-classification',
					message: `sense "${sense.id}" reveals special-category record "${record.id}" on a desk that declares no purpose`
				});
			}
		}
	}
}

function checkReset(
	world: WorldDefinition,
	instance: WorldInstance,
	layoutId: string,
	volatile: readonly string[],
	issues: ConformanceIssue[]
): void {
	const fresh = strip(world.create(layoutId).snapshot(), volatile);
	// Something happened, then reset: the desk must forget it.
	const firstAction = world.actions[0];
	if (firstAction) instance.perform({ name: firstAction.id, arguments: {} });
	instance.receiveInput?.('anything');
	instance.reset();
	const after = strip(instance.snapshot(), volatile);
	if (JSON.stringify(after) !== JSON.stringify(fresh)) {
		issues.push({
			check: 'desk.reset-identical',
			message: `layout "${layoutId}": reset() does not return to what a fresh create() gives`
		});
	}
}

const SAMPLE: Record<Injection['kind'], Injection> = {
	heard: { kind: 'heard', text: 'A line overheard.' },
	'manual-entry': { kind: 'manual-entry', key: 'note', text: 'A note.' },
	'tool-result': { kind: 'tool-result', toolId: 'probe', result: { ok: true } },
	radio: { kind: 'radio', fromName: 'Probe', channel: 'probe', text: 'A message.' }
};

function checkInjections(
	instance: WorldInstance,
	accepted: readonly Injection['kind'][] | undefined,
	issues: ConformanceIssue[]
): void {
	if (!instance.inject) {
		issues.push({
			check: 'desk.injections',
			message:
				'the desk has no inject door — a scenario carrying an injection could never run on it'
		});
		return;
	}
	const takes = new Set(accepted ?? (Object.keys(SAMPLE) as Injection['kind'][]));
	for (const kind of Object.keys(SAMPLE) as Injection['kind'][]) {
		const before = JSON.stringify(instance.snapshot());
		try {
			instance.inject(SAMPLE[kind]);
		} catch (error) {
			issues.push({
				check: 'desk.injections',
				message: `inject(${kind}) threw: ${describeError(error)}`
			});
			continue;
		}
		const changed = JSON.stringify(instance.snapshot()) !== before;
		if (takes.has(kind) && !changed) {
			issues.push({
				check: 'desk.injections',
				message: `inject(${kind}) changed nothing on a desk the fixture says accepts it`
			});
		}
		if (!takes.has(kind) && changed) {
			issues.push({
				check: 'desk.injections',
				message: `inject(${kind}) changed the desk though the fixture says it declines that kind`
			});
		}
	}
}

/**
 * Throwing stubs in place of every clock and every source of platform
 * randomness, for exactly as long as the desk is exercised. A desk that
 * reaches for any of them fails here rather than differing between two runs
 * of the same seed somewhere far away.
 */
function checkPurity(
	world: WorldDefinition,
	layoutIds: readonly string[],
	scripts: Record<string, WorldScriptFixture>,
	issues: ConformanceIssue[]
): void {
	const globals = globalThis as unknown as Record<string, unknown>;
	// `crypto` and `performance` are getter-only on `globalThis` in Node, so
	// every global goes through its descriptor and is restored the same way.
	const names = ['Date', 'crypto', 'performance'] as const;
	const saved = Object.fromEntries(
		names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
	) as Record<(typeof names)[number], PropertyDescriptor | undefined>;
	const savedRandom = Math.random;
	const refuse = (what: string) => () => {
		throw new Error(`desk reached for ${what}`);
	};
	const FakeDate = new Proxy(globals['Date'] as object, {
		construct: refuse('the clock (new Date)'),
		apply: refuse('the clock (Date())'),
		get: (target, property) => {
			if (property === 'now') return refuse('the clock (Date.now)');
			return Reflect.get(target, property);
		}
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
		for (const layoutId of layoutIds) {
			try {
				const instance = world.create(layoutId);
				instance.snapshot();
				for (const sense of world.senses) instance.observe([sense.id]);
				for (const script of Object.values(scripts)) {
					if (script.layoutId !== layoutId) continue;
					const fresh = world.create(layoutId);
					for (const call of script.calls) fresh.perform(call);
				}
			} catch (error) {
				issues.push({
					check: 'desk.perform-pure',
					message: `layout "${layoutId}": ${describeError(error)}`
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

function strip(state: Record<string, unknown>, omit: readonly string[]): unknown {
	const copy: Record<string, unknown> = { ...state };
	for (const key of omit) delete copy[key];
	return copy;
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export type { DeskConformanceFixture, WorldIllegalCallFixture };
