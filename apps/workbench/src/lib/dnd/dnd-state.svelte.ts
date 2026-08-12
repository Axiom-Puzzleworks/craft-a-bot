import type { BrickKind } from '$lib/bricks.js';
import {
	findHoveredSocket,
	findSnapTarget,
	nextIndex,
	type Point,
	type SocketBounds
} from './geometry.js';

/**
 * One state machine, two ways to drive it.
 *
 * The keyboard path is not a parallel implementation of drag and drop — it is
 * the *same* pick-up / aim / place / cancel machine, driven by keys instead of a
 * pointer (03-UI-UX-DESIGN.md §4.4). That is deliberate: a separate keyboard
 * code path would drift out of step the first time drag behaviour changed, and
 * "build a bot keyboard-only" is a definition-of-done guarantee, not a
 * nice-to-have.
 */

export type CarryMode = 'pointer' | 'keyboard';

export interface CarryState {
	kind: BrickKind;
	mode: CarryMode;
	/** Where it came from, so a cancelled drag can spring back. */
	origin: 'tray' | 'socket';
	/** Pointer position, for the lifted brick's transform. */
	at?: Point;
}

export interface DndCallbacks {
	/** Snap a brick into its socket. */
	onPlace(kind: BrickKind): void;
	/** Pop a brick back off the baseplate. */
	onRemove(kind: BrickKind): void;
	/** Screen-reader narration (03 §8). */
	announce(message: string): void;
}

export interface DndController {
	readonly carrying: CarryState | undefined;
	readonly candidate: BrickKind | undefined;
	readonly rejecting: BrickKind | undefined;
	/** Which socket the keyboard cursor is aimed at. */
	readonly aimedAt: BrickKind | undefined;

	registerSocket(kind: BrickKind, element: HTMLElement): () => void;

	liftWithPointer(kind: BrickKind, origin: CarryState['origin'], at: Point): void;
	movePointer(at: Point): void;
	dropPointer(): void;

	liftWithKeyboard(kind: BrickKind, origin: CarryState['origin']): void;
	aim(step: 1 | -1): void;
	placeAimed(): void;

	cancel(): void;
}

export function createDndController(callbacks: DndCallbacks): DndController {
	// Deliberately a plain Map, not a SvelteMap: this holds DOM elements that are
	// measured on demand during a drag. Nothing renders from it, so making it
	// reactive would add invalidations for no observable benefit.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const sockets = new Map<BrickKind, HTMLElement>();
	const order: BrickKind[] = [];

	const state = $state<{
		carrying: CarryState | undefined;
		candidate: BrickKind | undefined;
		rejecting: BrickKind | undefined;
		aimIndex: number;
	}>({ carrying: undefined, candidate: undefined, rejecting: undefined, aimIndex: 0 });

	function bounds(): SocketBounds[] {
		return order
			.filter((kind) => sockets.has(kind))
			.map((kind) => {
				const element = sockets.get(kind);
				/* c8 ignore next -- filtered above; kept so the map stays total */
				if (!element) throw new Error(`socket element missing for ${kind}`);
				return { kind, rect: element.getBoundingClientRect() };
			});
	}

	function clear(): void {
		state.carrying = undefined;
		state.candidate = undefined;
		state.rejecting = undefined;
	}

	function place(kind: BrickKind): void {
		callbacks.onPlace(kind);
		callbacks.announce(`${kind} brick placed.`);
		clear();
	}

	return {
		get carrying() {
			return state.carrying;
		},
		get candidate() {
			return state.candidate;
		},
		get rejecting() {
			return state.rejecting;
		},
		get aimedAt() {
			return state.carrying?.mode === 'keyboard' ? order[state.aimIndex] : undefined;
		},

		registerSocket(kind, element) {
			sockets.set(kind, element);
			if (!order.includes(kind)) order.push(kind);
			return () => {
				sockets.delete(kind);
			};
		},

		liftWithPointer(kind, origin, at) {
			state.carrying = { kind, mode: 'pointer', origin, at };
			callbacks.announce(`Picked up the ${kind} brick.`);
		},

		movePointer(at) {
			if (!state.carrying) return;
			state.carrying = { ...state.carrying, at };

			const snap = findSnapTarget(bounds(), state.carrying.kind, at);
			state.candidate = snap?.kind;
			// Over the wrong socket entirely: show the head-shake, not nothing.
			const hovered = findHoveredSocket(bounds(), at);
			state.rejecting =
				snap === undefined && hovered !== undefined && hovered.kind !== state.carrying.kind
					? hovered.kind
					: undefined;
		},

		dropPointer() {
			const carrying = state.carrying;
			if (!carrying) return;

			if (state.candidate !== undefined) {
				place(carrying.kind);
				return;
			}
			// Dropped on nothing: a brick dragged off the baseplate goes back to
			// the tray, one dragged from the tray simply springs home (03 §4.4).
			if (carrying.origin === 'socket') {
				callbacks.onRemove(carrying.kind);
				callbacks.announce(`${carrying.kind} brick returned to the tray.`);
			} else {
				callbacks.announce('Put back.');
			}
			clear();
		},

		liftWithKeyboard(kind, origin) {
			state.carrying = { kind, mode: 'keyboard', origin };
			const aimIndex = order.indexOf(kind);
			state.aimIndex = aimIndex === -1 ? 0 : aimIndex;
			callbacks.announce(
				`Picked up the ${kind} brick. Use the arrow keys to choose a socket, Enter to place, Escape to cancel.`
			);
		},

		aim(step) {
			if (state.carrying?.mode !== 'keyboard') return;
			state.aimIndex = nextIndex(state.aimIndex, order.length, step);
			const aimed = order[state.aimIndex];
			if (aimed === undefined) return;
			const fits = aimed === state.carrying.kind;
			state.candidate = fits ? aimed : undefined;
			state.rejecting = fits ? undefined : aimed;
			callbacks.announce(
				fits ? `${aimed} socket — this one fits.` : `${aimed} socket — the wrong shape.`
			);
		},

		placeAimed() {
			const carrying = state.carrying;
			if (carrying?.mode !== 'keyboard') return;
			const aimed = order[state.aimIndex];
			if (aimed === carrying.kind) {
				place(carrying.kind);
				return;
			}
			callbacks.announce(`The ${carrying.kind} brick does not fit the ${aimed} socket.`);
		},

		cancel() {
			if (!state.carrying) return;
			callbacks.announce('Put back.');
			clear();
		}
	};
}
