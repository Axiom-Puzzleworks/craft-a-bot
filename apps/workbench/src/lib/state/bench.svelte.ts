import {
	brickInSlot,
	migrateBrickConfig,
	validateSpec,
	type AgentRecord,
	type AgentSpecV2,
	type BrickKindDefinition,
	type BuildProblem,
	type FittedBrick,
	type GoalCardDefinition,
	type SlotId
} from '@craftabot/core';
import { createRegistry } from '$lib/packs.js';
import { contentStore } from './content.svelte.js';
import { appStorage } from './app-storage.svelte.js';
import { createBrowserKeyVault } from './keys.js';
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
 * **The bench holds spec v2** (WP14), and since slice 4b speaks its vocabulary
 * throughout. There is no translation door left here: a *kind id* goes in when
 * a brick is fitted, because that is what identifies a brick, and a *socket*
 * goes in for everything afterwards, because that is what identifies a place on
 * the chassis. The `BrickKind` window — V1's six names — is gone.
 */

const UNDO_LIMIT = 50;
const SAVE_DEBOUNCE_MS = 250;

export interface BenchStore {
	readonly spec: AgentSpecV2 | undefined;
	readonly problems: BuildProblem[];
	readonly blocking: BuildProblem[];
	readonly canGo: boolean;
	readonly canUndo: boolean;
	readonly saving: boolean;
	readonly goalCard: GoalCardDefinition | undefined;

	open(agentId: string): Promise<void>;
	/** Snap a registered kind onto the chassis, in whichever socket it belongs to. */
	fitBrick(kindId: string): void;
	removeBrick(slot: SlotId): void;
	/** What is in a socket, for the tray and the baseplate to draw. */
	fittedIn(slot: SlotId): { kindId: string; name: string } | undefined;
	/**
	 * How many bricks sit in the socket *behind* the one the bench shows (WP40,
	 * `26-…` §6.13): the Kit keeps one well per socket, so a stack fitted in the
	 * Spec Lab reads here as a chip — "+2 more, see Workshop".
	 */
	extraIn(slot: SlotId): number;
	/**
	 * The brick fitted for a tray kind, and the registered kind that defines it
	 * (WP14 slice 4a).
	 *
	 * What the panel needs and all it needs: a config to show and a schema to
	 * show it by. `undefined` when nothing is fitted there, or when the kind
	 * came from a pack this workbench has not got — which `validateSpec` has
	 * already put in the ribbon.
	 */
	brickFor(slot: SlotId): { brick: FittedBrick; kind: BrickKindDefinition } | undefined;
	/**
	 * Merge a patch into a brick's config.
	 *
	 * > **Amended 2026-08-13 (WP14 slice 4a):** the patch was typed
	 * > `Partial<AgentSpec['bricks'][K]>` — V1's shape, so only V1's six bricks
	 * > could be edited by a type that compiled. The runtime was already generic;
	 * > this makes the type honest. A config is whatever its kind's schema says,
	 * > and `validateSpec` is what holds it to that.
	 */
	updateBrick(slot: SlotId, patch: Record<string, unknown>): void;
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
	// Rebuilt whenever authored content changes (WP46): a card saved in the Studio validates on the bench at once.
	const registry = $derived.by(() => {
		void contentStore.records;
		return createRegistry();
	});

	const state = $state<{
		record: AgentRecord | undefined;
		spec: AgentSpecV2 | undefined;
		problems: BuildProblem[];
		undoStack: AgentSpecV2[];
		saving: boolean;
	}>({ record: undefined, spec: undefined, problems: [], undoStack: [], saving: false });

	/**
	 * A registered kind, or a refusal.
	 *
	 * Everything a freshly-snapped brick needs comes from the pack that defined
	 * it — its socket, its config version, its defaults. `BRICK_DEFAULTS` used to
	 * live in this file, which meant the workbench and the pack each had an
	 * opinion about what a new Memory brick remembers: the sort of duplication
	 * that stays right until the day it does not (`14-…` §2).
	 */
	function kindOf(kindId: string): BrickKindDefinition {
		const registered = registry.getBrickKind(kindId);
		if (!registered) throw new Error(`No brick kind "${kindId}" is registered.`);
		return registered;
	}

	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let pendingSave: Promise<void> = Promise.resolve();

	function revalidate(): void {
		state.problems = state.spec
			? validateSpec(state.spec, registry, {
					hasCredential: (id) => createBrowserKeyVault().get(id) !== undefined
				})
			: [];
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

		fittedIn(slot) {
			if (!state.spec) return undefined;
			const brick = brickInSlot(state.spec, slot);
			if (!brick) return undefined;
			// A kind no pack registered still occupies the socket — the ribbon has
			// said so, and pretending the socket is empty would let a second brick
			// be dropped on top of it.
			const registered = registry.getBrickKind(brick.kind);
			return { kindId: brick.kind, name: registered?.name ?? brick.kind };
		},

		extraIn(slot) {
			if (!state.spec) return 0;
			return Math.max(0, state.spec.bricks.filter((brick) => brick.slot === slot).length - 1);
		},

		brickFor(slot) {
			if (!state.spec) return undefined;
			const brick = brickInSlot(state.spec, slot);
			if (!brick) return undefined;
			const registered = registry.getBrickKind(brick.kind);
			return registered ? { brick, kind: registered } : undefined;
		},

		fitBrick(kindId) {
			mutate((spec) => {
				const kind = kindOf(kindId);
				// One brick per socket is V1's rule, not the format's (`14-…` §2.3):
				// the array would happily hold two, and the Workshop will.
				if (brickInSlot(spec, kind.slot) !== undefined) return;
				// Structured clone so the kind's defaults object is never aliased
				// into a spec and quietly mutated by a later panel edit.
				spec.bricks = [
					...spec.bricks,
					{
						slot: kind.slot,
						kind: kind.id,
						configVersion: kind.configVersion,
						config: structuredClone(kind.defaults as Record<string, unknown>)
					}
				];
			});
		},

		// Only the brick the bench shows — the first in the socket (WP40). A
		// stack fitted in the Spec Lab keeps its other bricks; the bench never
		// edits what it cannot see.
		removeBrick(slot) {
			mutate((spec) => {
				const index = spec.bricks.findIndex((brick) => brick.slot === slot);
				if (index === -1) return;
				spec.bricks = spec.bricks.filter((_brick, i) => i !== index);
			});
		},

		/*
		 * Migrates the stored config forward before merging the patch onto it
		 * (WP24), rather than patching it in place. A brick's config can lag its
		 * kind's `configVersion` — the pack shipped a newer shape since this bot
		 * was last saved — and patching the *old* shape means the edit only lasts
		 * until the config is next migrated (a live session building runtimes, or
		 * this same bot re-opened elsewhere), at which point the migration
		 * recomputes the field the patch touched and quietly overwrites it. Only
		 * `updateBrick` can close that gap: it is the one place a config is
		 * written back to storage rather than only read.
		 */
		updateBrick(slot, patch) {
			mutate((spec) => {
				const index = spec.bricks.findIndex((brick) => brick.slot === slot);
				spec.bricks = spec.bricks.map((brick, i) => {
					if (i !== index) return brick;
					const kind = registry.getBrickKind(brick.kind);
					const config = kind
						? migrateBrickConfig(brick.config, brick.configVersion, kind)
						: brick.config;
					return {
						...brick,
						configVersion: kind?.configVersion ?? brick.configVersion,
						config: { ...config, ...patch }
					};
				});
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
