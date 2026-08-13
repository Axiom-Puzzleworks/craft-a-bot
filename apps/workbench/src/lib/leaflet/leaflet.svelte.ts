import { untrack } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import {
	CHAPTERS,
	chapterByNumber,
	currentStepOf,
	isChapterComplete,
	isStepDone,
	type Chapter,
	type LeafletContext,
	type LeafletStep
} from './chapters.js';
import { createSettingsStore, type SettingsStore } from '$lib/state/settings.js';

/**
 * The Instruction Leaflet's controller (03-UI-UX-DESIGN.md §6).
 *
 * The chapters themselves are pure data; this is the small amount of state that
 * cannot be: which chapter the reader is on, what they have acknowledged, and
 * whether the leaflet is open. Progress and badges live in the settings store,
 * which has carried `tutorialChapter` and `badges` since WP4 and until now had
 * nobody reading them.
 *
 * Routes push context in with `report()` rather than the leaflet reaching into
 * their stores — the bench and the Playroom own quite different state, and a
 * controller that knew about both would be coupled to every screen it points at.
 */

export interface LeafletStepView {
	step: LeafletStep;
	done: boolean;
	current: boolean;
}

export interface LeafletController {
	readonly open: boolean;
	readonly started: boolean;
	readonly chapter: Chapter | undefined;
	readonly step: LeafletStep | undefined;
	readonly steps: LeafletStepView[];
	readonly badges: readonly string[];
	/** All six chapters done. */
	readonly complete: boolean;
	readonly justEarned: string | undefined;

	show(): void;
	hide(): void;
	/** "I've built kits before." */
	skip(): void;
	restart(): void;
	ack(stepId: string): void;
	dismissBadge(): void;
	report(patch: Partial<LeafletContext>): void;
}

export interface LeafletDeps {
	settings?: SettingsStore;
}

/**
 * The app's single leaflet. A singleton because the reader is reading one
 * leaflet, and it has to survive navigation between the bench and the Playroom
 * — half the chapters span both. Tests build their own with `createLeaflet`.
 */
let shared: LeafletController | undefined;

export function leafletStore(): LeafletController {
	shared ??= createLeaflet();
	return shared;
}

export function createLeaflet(deps: LeafletDeps = {}): LeafletController {
	const settings =
		deps.settings ??
		createSettingsStore(
			typeof localStorage === 'undefined'
				? { getItem: () => null, setItem: () => {}, removeItem: () => {} }
				: localStorage
		);

	const saved = settings.read();

	const state = $state({
		/** Chapters *completed*; the reader is working on this number plus one. */
		completed: saved.tutorialChapter,
		badges: [...saved.badges],
		// Auto-open for a first-timer who has not waved it away (agreed in
		// planning): onboarding that waits to be discovered generally is not.
		open: saved.tutorialChapter === 0 && !saved.tutorialSkipped,
		justEarned: undefined as string | undefined,
		acked: new SvelteSet<string>(),
		/** Evidence steps already satisfied in this chapter (see `latch`). */
		latched: new SvelteSet<string>(),
		context: {
			route: 'shelf',
			can: undefined,
			goalCardId: undefined,
			outcome: undefined,
			variant: undefined,
			ticks: 0,
			usedTools: [],
			sawApproval: false,
			acked: new SvelteSet<string>()
		} as LeafletContext
	});

	function contextNow(): LeafletContext {
		return { ...state.context, acked: state.acked };
	}

	function chapter(): Chapter | undefined {
		return chapterByNumber(state.completed + 1);
	}

	/**
	 * Remember every latching step that is true right now. Called after each
	 * report, because the evidence behind them (a tick count, a run outcome) is
	 * gone by the time the reader presses STEP again.
	 */
	function latchSatisfied(): void {
		const active = chapter();
		if (!active) return;
		const now = contextNow();
		const newly = active.steps.filter((step) => step.latch && step.done(now));
		if (newly.length > 0) {
			state.latched = new SvelteSet([...state.latched, ...newly.map((step) => step.id)]);
		}
	}

	/** Award the badge and move on, if the current chapter is finished. */
	function advanceIfComplete(): void {
		const active = chapter();
		if (!active || !isChapterComplete(active, contextNow(), state.latched)) return;

		if (!state.badges.includes(active.badge.id)) {
			state.badges = [...state.badges, active.badge.id];
			state.justEarned = active.badge.id;
		}
		state.completed = active.number;
		// A finished chapter starts the next one clean, so an ack from chapter one
		// cannot satisfy a same-named step later.
		state.acked = new SvelteSet<string>();
		state.latched = new SvelteSet<string>();
		settings.update({ tutorialChapter: state.completed, badges: state.badges });
	}

	return {
		get open() {
			return state.open;
		},
		get started() {
			return state.completed > 0 || state.acked.size > 0;
		},
		get chapter() {
			return chapter();
		},
		get step() {
			const active = chapter();
			return active ? currentStepOf(active, contextNow(), state.latched) : undefined;
		},
		get steps() {
			const active = chapter();
			if (!active) return [];
			const current = currentStepOf(active, contextNow(), state.latched);
			return active.steps.map((step) => ({
				step,
				done: isStepDone(step, contextNow(), state.latched),
				current: step.id === current?.id
			}));
		},
		get badges() {
			return state.badges;
		},
		get complete() {
			return state.completed >= CHAPTERS.length;
		},
		get justEarned() {
			return state.justEarned;
		},

		show() {
			state.open = true;
		},
		hide() {
			state.open = false;
		},
		skip() {
			state.open = false;
			settings.update({ tutorialSkipped: true });
		},
		restart() {
			state.completed = 0;
			state.badges = [];
			state.acked = new SvelteSet<string>();
			state.latched = new SvelteSet<string>();
			state.justEarned = undefined;
			state.open = true;
			settings.update({ tutorialChapter: 0, badges: [], tutorialSkipped: false });
		},
		ack(stepId) {
			state.acked = new SvelteSet([...state.acked, stepId]);
			latchSatisfied();
			advanceIfComplete();
		},
		dismissBadge() {
			state.justEarned = undefined;
		},

		report(patch) {
			/*
			 * Untracked because routes call this from an `$effect`.
			 *
			 * Reading `state.context` here would make the caller's effect depend on
			 * state this very call then writes — a self-retriggering loop, which is
			 * exactly what happened: `effect_update_depth_exceeded`, and a page that
			 * rendered correctly but responded to nothing. The reads below are
			 * bookkeeping, not subscriptions.
			 */
			untrack(() => applyReport(patch));
		}
	};

	function applyReport(patch: Partial<LeafletContext>): void {
		const next = { ...state.context, ...patch };

		/*
		 * Any change to the build invalidates the evidence from the last run.
		 *
		 * Not just the Goal Card: `variant` is derived from what the bot can do, so
		 * the instant the reader fits the Actions brick it flips from 'no-actions'
		 * to 'no-sight' — and chapter 1's "run it again" step would tick itself off
		 * using the tick count from the run *before* the fix. The reader would be
		 * congratulated for a run they never made.
		 *
		 * Compared by capability fingerprint since WP14 slice 4c, where this
		 * stringified the whole spec. Slightly narrower, and deliberately so:
		 * nudging the temperature dial is a change to the spec and no change at all
		 * to anything the tutorial can observe.
		 */
		const rebuilt =
			patch.can !== undefined &&
			state.context.can !== undefined &&
			patch.can.fingerprint !== state.context.can.fingerprint;

		if (rebuilt) {
			next.outcome = undefined;
			next.variant = patch.variant ?? undefined;
			next.ticks = 0;
			next.usedTools = [];
			next.sawApproval = false;
		}

		state.context = next;
		latchSatisfied();
		advanceIfComplete();
	}
}
