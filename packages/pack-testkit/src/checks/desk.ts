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

	return issues;
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
