import {
	validateSpec,
	type AgentRecord,
	type AgentSpec,
	type BuildProblem,
	type GoalCardDefinition
} from '@craftabot/core';
import type { BrickKind } from '$lib/bricks.js';
import { createRegistry } from '$lib/packs.js';
import { appStorage } from './app-storage.svelte.js';
import type { Storage } from './storage.js';
import { qualifyPlayroomId } from '@craftabot/pack-starter';

/**
 * The bench: the spec currently being edited, what the build checks make of it,
 * and the undo stack.
 *
 * `03-UI-UX-DESIGN.md` §4.3 says panel changes apply live to the `AgentSpec`
 * with undo, and WP5's DoD says edits persist — so every mutation goes through
 * `mutate()`, which snapshots for undo, revalidates, and schedules a save. There
 * is deliberately no other way to change the spec.
 */

const UNDO_LIMIT = 50;
const SAVE_DEBOUNCE_MS = 250;

/** Defaults a brick gets when first snapped on, from 02-AGENT-MODEL.md §2. */
export const BRICK_DEFAULTS = {
	llm: { cartridgeId: '', temperature: 0.7, maxTokens: 300, personality: '' },
	memory: { windowSize: 10 as const, notebook: false },
	tools: { enabled: [] as string[] },
	/*
	 * Qualified, as `01-…` §4 requires (E6, WP13).
	 *
	 * The engine still resolves the bare `sight`/`move` that specs written
	 * before WP13 hold, so nobody's saved bot breaks — but a spec written today
	 * should name content the way content is named, or the compatibility path
	 * quietly becomes the normal one.
	 */
	sense: { channels: [qualifyPlayroomId('sight'), qualifyPlayroomId('compass')] },
	/*
	 * All seven Playroom actions (02-AGENT-MODEL.md §2.5), not a starter subset.
	 *
	 * This used to be `['move', 'say', 'celebrate']`, and most Goal Cards were
	 * quietly unreachable with it — the snack goal needs `pick_up` and `give`.
	 * Nobody noticed because until WP9 the engine performed any action the world
	 * defined, enabled or not, so the checkboxes did nothing. Now that the brick
	 * genuinely gates, fitting "hands and wheels" has to actually give the bot
	 * hands; the checkboxes are for taking capabilities *away*.
	 */
	actions: {
		enabled: ['move', 'pick_up', 'put_down', 'give', 'open', 'say', 'celebrate'].map(
			qualifyPlayroomId
		)
	},
	/*
	 * `repeatLimit` is on out of the box.
	 *
	 * It shipped off in V1.0 for a good reason — v1 counted identical calls
	 * whatever came of them, so it stopped a bot walking in a straight line —
	 * and the cost was that the reported hello-loop was the *default*
	 * experience (`12-…` C3). WP11's v2 rule counts repeats inside a ten-turn
	 * window and exempts a `move` that worked, which makes the straight-line
	 * false positive impossible and the default safe.
	 *
	 * The lesson survives switching it on: the leaflet's loop chapter turns it
	 * *off* to show what happens without it, which is the better demonstration
	 * anyway — a control you remove and miss teaches more than one you never had.
	 */
	safety: { maxTicks: 30, blockedActions: [] as string[], approvalMode: false, repeatLimit: 3 }
};

export interface BenchStore {
	readonly spec: AgentSpec | undefined;
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
		spec: AgentSpec | undefined;
		problems: BuildProblem[];
		undoStack: AgentSpec[];
		saving: boolean;
	}>({ record: undefined, spec: undefined, problems: [], undoStack: [], saving: false });

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
	function mutate(change: (spec: AgentSpec) => void): void {
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

		hasBrick: (kind) => state.spec?.bricks[kind] !== undefined,

		fitBrick(kind) {
			mutate((spec) => {
				if (spec.bricks[kind] !== undefined) return;
				// Structured clone so the shared defaults object is never aliased
				// into a spec and quietly mutated by a later panel edit.
				spec.bricks = { ...spec.bricks, [kind]: structuredClone(BRICK_DEFAULTS[kind]) };
			});
		},

		removeBrick(kind) {
			mutate((spec) => {
				const bricks = { ...spec.bricks };
				delete bricks[kind];
				spec.bricks = bricks;
			});
		},

		updateBrick(kind, patch) {
			mutate((spec) => {
				const existing = spec.bricks[kind];
				if (existing === undefined) return;
				spec.bricks = { ...spec.bricks, [kind]: { ...existing, ...patch } };
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
