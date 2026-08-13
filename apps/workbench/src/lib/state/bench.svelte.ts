import {
	asLegacySpec,
	brickInSlot,
	validateSpec,
	type AgentRecord,
	type AgentSpec,
	type AgentSpecV2,
	type BuildProblem,
	type FittedBrick,
	type GoalCardDefinition
} from '@craftabot/core';
import { brickDefinition, type BrickKind } from '$lib/bricks.js';
import { createRegistry } from '$lib/packs.js';
import { appStorage } from './app-storage.svelte.js';
import type { Storage } from './storage.js';

/**
 * The bench: the spec currently being edited, what the build checks make of it,
 * and the undo stack.
 *
 * `03-UI-UX-DESIGN.md` §4.3 says panel changes apply live to the `AgentSpec`
 * with undo, and WP5's DoD says edits persist — so every mutation goes through
 * `mutate()`, which snapshots for undo, revalidates, and schedules a save. There
 * is deliberately no other way to change the spec.
 *
 * **The bench holds spec v2** (WP14). The parts tray, the sockets and the panels
 * still speak V1's six brick names, because the UI that knows about exactly six
 * bricks is slice 4's problem — so this store translates at its own door: a
 * `BrickKind` in, a fitted brick in the right socket out. What is *stored*, and
 * what is exported, is v2 all the way down.
 */

const UNDO_LIMIT = 50;
const SAVE_DEBOUNCE_MS = 250;

export interface BenchStore {
	readonly spec: AgentSpecV2 | undefined;
	/**
	 * The same bot through V1's six-key window, for the panels and the leaflet.
	 *
	 * A transition shim with a deadline: slice 4 makes the panels schema-driven
	 * and this goes with them. It is a getter rather than stored state so there
	 * is no second copy of the truth to keep in step.
	 */
	readonly legacySpec: AgentSpec | undefined;
	readonly problems: BuildProblem[];
	readonly blocking: BuildProblem[];
	readonly canGo: boolean;
	readonly canUndo: boolean;
	readonly saving: boolean;
	readonly goalCard: GoalCardDefinition | undefined;

	open(agentId: string): Promise<void>;
	fitBrick(kind: BrickKind): void;
	removeBrick(kind: BrickKind): void;
	hasBrick(kind: BrickKind): boolean;
	updateBrick<K extends BrickKind>(
		kind: K,
		patch: Partial<NonNullable<AgentSpec['bricks'][K]>>
	): void;
	setGoalCard(cardId: string): void;
	setCustomGoalText(text: string): void;
	rename(name: string): void;
	undo(): void;
	/** Force any pending save to land — used before navigating away. */
	flush(): Promise<void>;
}

export interface BenchStoreDeps {
	storage?: () => Promise<Storage>;
	now?: () => string;
	/** 0 disables debouncing, which tests want. */
	saveDebounceMs?: number;
}

export function createBenchStore(deps: BenchStoreDeps = {}): BenchStore {
	const storage = deps.storage ?? appStorage;
	// A one-shot read for a timestamp string, not mutable reactive state — a
	// SvelteDate here would be reactive machinery around a value we never keep.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const now = deps.now ?? (() => new Date().toISOString());
	const debounceMs = deps.saveDebounceMs ?? SAVE_DEBOUNCE_MS;
	const registry = createRegistry();

	const state = $state<{
		record: AgentRecord | undefined;
		spec: AgentSpecV2 | undefined;
		problems: BuildProblem[];
		undoStack: AgentSpecV2[];
		saving: boolean;
	}>({ record: undefined, spec: undefined, problems: [], undoStack: [], saving: false });

	/**
	 * What a `BrickKind` from the parts tray means in v2 terms: which registered
	 * kind it is, which socket it goes in, and what it does when freshly snapped
	 * on.
	 *
	 * All three come from the pack. `BRICK_DEFAULTS` used to live in this file,
	 * which meant the workbench and the pack each had an opinion about what a new
	 * Memory brick remembers — the sort of duplication that stays right until the
	 * day it does not. The pack owns the brick, so the pack owns the answer
	 * (`14-…` §2).
	 */
	function kindFor(brickKind: BrickKind): {
		id: string;
		slot: FittedBrick['slot'];
		configVersion: number;
		defaults: Record<string, unknown>;
	} {
		const id = brickDefinition(brickKind).id;
		const registered = registry.getBrickKind(id);
		if (!registered) throw new Error(`No brick kind "${id}" is registered.`);
		return {
			id,
			slot: registered.slot,
			configVersion: registered.configVersion,
			defaults: registered.defaults as Record<string, unknown>
		};
	}

	/** The fitted brick a tray kind corresponds to, by socket *and* kind id. */
	function fitted(spec: AgentSpecV2, brickKind: BrickKind): FittedBrick | undefined {
		const { id, slot } = kindFor(brickKind);
		const inSlot = brickInSlot(spec, slot);
		return inSlot?.kind === id ? inSlot : undefined;
	}

	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let pendingSave: Promise<void> = Promise.resolve();

	function revalidate(): void {
		state.problems = state.spec ? validateSpec(state.spec, registry) : [];
	}

	async function save(): Promise<void> {
		const { record, spec } = state;
		if (!record || !spec) return;
		state.saving = true;
		try {
			// Snapshot before it crosses into storage: the store deep-copies what it
			// is given, and a reactive proxy cannot be structured-cloned.
			await (
				await storage()
			).putAgent({
				...record,
				spec: $state.snapshot(spec),
				lastValidation: $state.snapshot(state.problems),
				updatedAt: spec.updatedAt
			});
		} finally {
			state.saving = false;
		}
	}

	function scheduleSave(): void {
		if (saveTimer !== undefined) clearTimeout(saveTimer);
		if (debounceMs === 0) {
			pendingSave = pendingSave.then(save);
			return;
		}
		saveTimer = setTimeout(() => {
			saveTimer = undefined;
			pendingSave = pendingSave.then(save);
		}, debounceMs);
	}

	/** The single door every spec change goes through. */
	function mutate(change: (spec: AgentSpecV2) => void): void {
		const current = state.spec;
		if (!current) return;

		// `$state.snapshot`, not `structuredClone`: `current` is a reactive proxy
		// and structuredClone throws DataCloneError on one.
		state.undoStack.push($state.snapshot(current));
		if (state.undoStack.length > UNDO_LIMIT) state.undoStack.shift();

		change(current);
		current.updatedAt = now();
		revalidate();
		scheduleSave();
	}

	return {
		get spec() {
			return state.spec;
		},
		get legacySpec() {
			return state.spec ? asLegacySpec(state.spec) : undefined;
		},
		get problems() {
			return state.problems;
		},
		get blocking() {
			return state.problems.filter((problem) => problem.severity === 'blocking');
		},
		/** Only blocking problems disable GO; warnings explain without blocking (03 §4.2). */
		get canGo() {
			return state.spec !== undefined && !state.problems.some((p) => p.severity === 'blocking');
		},
		get canUndo() {
			return state.undoStack.length > 0;
		},
		get saving() {
			return state.saving;
		},
		get goalCard() {
			return state.spec ? registry.getGoalCard(state.spec.goalCardId) : undefined;
		},

		async open(agentId) {
			const record = await (await storage()).getAgent(agentId);
			state.record = record;
			state.spec = record ? structuredClone(record.spec) : undefined;
			state.undoStack = [];
			revalidate();
		},

		hasBrick: (kind) => (state.spec ? fitted(state.spec, kind) !== undefined : false),

		fitBrick(kind) {
			mutate((spec) => {
				const { id, slot, configVersion, defaults } = kindFor(kind);
				// One brick per socket is V1's rule, not the format's (`14-…` §2.3):
				// the array would happily hold two, and the Workshop will.
				if (brickInSlot(spec, slot) !== undefined) return;
				// Structured clone so the kind's defaults object is never aliased
				// into a spec and quietly mutated by a later panel edit.
				spec.bricks = [
					...spec.bricks,
					{ slot, kind: id, configVersion, config: structuredClone(defaults) }
				];
			});
		},

		removeBrick(kind) {
			mutate((spec) => {
				const { slot } = kindFor(kind);
				spec.bricks = spec.bricks.filter((brick) => brick.slot !== slot);
			});
		},

		updateBrick(kind, patch) {
			mutate((spec) => {
				const { id } = kindFor(kind);
				const existing = fitted(spec, kind);
				if (existing === undefined) return;
				spec.bricks = spec.bricks.map((brick) =>
					brick.kind === id && brick.slot === existing.slot
						? { ...brick, config: { ...brick.config, ...patch } }
						: brick
				);
			});
		},

		setGoalCard(cardId) {
			mutate((spec) => {
				spec.goalCardId = cardId;
			});
		},

		setCustomGoalText(text) {
			mutate((spec) => {
				if (text === '') delete spec.customGoalText;
				else spec.customGoalText = text;
			});
		},

		rename(name) {
			mutate((spec) => {
				spec.name = name;
				// Two fields, one name. `identity` is where v2 says the bot's name
				// lives; `name` is still what everything reads. They converge when
				// the last reader moves across, and until then they move together.
				spec.identity.displayName = name;
			});
		},

		undo() {
			const previous = state.undoStack.pop();
			if (!previous) return;
			state.spec = previous;
			revalidate();
			scheduleSave();
		},

		async flush() {
			if (saveTimer !== undefined) {
				clearTimeout(saveTimer);
				saveTimer = undefined;
				pendingSave = pendingSave.then(save);
			}
			await pendingSave;
		}
	};
}

export const benchStore = createBenchStore();
