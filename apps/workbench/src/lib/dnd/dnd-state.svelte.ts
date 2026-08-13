import type { SlotId } from '@craftabot/core';
import { SOCKET_LABELS } from '$lib/bricks.js';
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
 *
 * > **Amended 2026-08-13 (WP14 slice 4b):** what is carried and what it is
 * > dropped into have come apart. They were the same value — a `BrickKind` —
 * > while a socket could hold exactly one kind of brick, and that identity is
 * > what made the tray, the baseplate and this machine unable to hold a seventh
 * > (`12-…` D11). A carry now names **a kind**; a socket is **a slot**; and a
 * > drop fits when the kind belongs to that slot.
 * >
 * > Announcements say the brick's own name and the socket's body-part label —
 * > "Picked up the Tool Belt Brick", "belt socket — this one fits" — rather than
 * > the internal words `tools` and `llm` they used to read out. A screen-reader
 * > user now hears what a sighted one sees printed on the socket.
 */

export type CarryMode = 'pointer' | 'keyboard';

/** The brick being carried: which kind, where it belongs, and what to call it. */
export interface CarriedBrick {
	kindId: string;
	slot: SlotId;
	/** The kind's display name, for narration. */
	name: string;
}

export interface CarryState extends CarriedBrick {
	mode: CarryMode;
	/** Where it came from, so a cancelled drag can spring back. */
	origin: 'tray' | 'socket';
	/** Pointer position, for the lifted brick's transform. */
	at?: Point;
}

export interface DndCallbacks {
	/** Snap a brick into the socket its kind belongs to. */
	onPlace(kindId: string): void;
	/** Pop whatever is in this socket back off the baseplate. */
	onRemove(slot: SlotId): void;
	/** Screen-reader narration (03 §8). */
	announce(message: string): void;
}

export interface DndController {
	readonly carrying: CarryState | undefined;
	readonly candidate: SlotId | undefined;
	readonly rejecting: SlotId | undefined;
	/** Which socket the keyboard cursor is aimed at. */
	readonly aimedAt: SlotId | undefined;

	registerSocket(slot: SlotId, element: HTMLElement): () => void;

	liftWithPointer(brick: CarriedBrick, origin: CarryState['origin'], at: Point): void;
	movePointer(at: Point): void;
	dropPointer(): void;

	liftWithKeyboard(brick: CarriedBrick, origin: CarryState['origin']): void;
	aim(step: 1 | -1): void;
	placeAimed(): void;

	cancel(): void;
}

/** What the user sees printed on the socket, which is what they should hear. */
const socketName = (slot: SlotId): string => SOCKET_LABELS[slot];

export function createDndController(callbacks: DndCallbacks): DndController {
	// Deliberately a plain Map, not a SvelteMap: this holds DOM elements that are
	// measured on demand during a drag. Nothing renders from it, so making it
	// reactive would add invalidations for no observable benefit.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const sockets = new Map<SlotId, HTMLElement>();
	const order: SlotId[] = [];

	const state = $state<{
		carrying: CarryState | undefined;
		candidate: SlotId | undefined;
		rejecting: SlotId | undefined;
		aimIndex: number;
	}>({ carrying: undefined, candidate: undefined, rejecting: undefined, aimIndex: 0 });

	function bounds(): SocketBounds[] {
		return order
			.filter((slot) => sockets.has(slot))
			.map((slot) => {
				const element = sockets.get(slot);
				/* c8 ignore next -- filtered above; kept so the map stays total */
				if (!element) throw new Error(`socket element missing for ${slot}`);
				return { slot, rect: element.getBoundingClientRect() };
			});
	}

	function clear(): void {
		state.carrying = undefined;
		state.candidate = undefined;
		state.rejecting = undefined;
	}

	function place(brick: CarriedBrick): void {
		callbacks.onPlace(brick.kindId);
		callbacks.announce(`${brick.name} placed.`);
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

		registerSocket(slot, element) {
			sockets.set(slot, element);
			if (!order.includes(slot)) order.push(slot);
			return () => {
				sockets.delete(slot);
			};
		},

		liftWithPointer(brick, origin, at) {
			state.carrying = { ...brick, mode: 'pointer', origin, at };
			callbacks.announce(`Picked up the ${brick.name}.`);
		},

		movePointer(at) {
			if (!state.carrying) return;
			state.carrying = { ...state.carrying, at };

			const snap = findSnapTarget(bounds(), state.carrying.slot, at);
			state.candidate = snap?.slot;
			// Over the wrong socket entirely: show the head-shake, not nothing.
			const hovered = findHoveredSocket(bounds(), at);
			state.rejecting =
				snap === undefined && hovered !== undefined && hovered.slot !== state.carrying.slot
					? hovered.slot
					: undefined;
		},

		dropPointer() {
			const carrying = state.carrying;
			if (!carrying) return;

			if (state.candidate !== undefined) {
				place(carrying);
				return;
			}
			// Dropped on nothing: a brick dragged off the baseplate goes back to
			// the tray, one dragged from the tray simply springs home (03 §4.4).
			if (carrying.origin === 'socket') {
				callbacks.onRemove(carrying.slot);
				callbacks.announce(`${carrying.name} returned to the tray.`);
			} else {
				callbacks.announce('Put back.');
			}
			clear();
		},

		liftWithKeyboard(brick, origin) {
			state.carrying = { ...brick, mode: 'keyboard', origin };
			const aimIndex = order.indexOf(brick.slot);
			state.aimIndex = aimIndex === -1 ? 0 : aimIndex;
			callbacks.announce(
				`Picked up the ${brick.name}. Use the arrow keys to choose a socket, Enter to place, Escape to cancel.`
			);
		},

		aim(step) {
			if (state.carrying?.mode !== 'keyboard') return;
			state.aimIndex = nextIndex(state.aimIndex, order.length, step);
			const aimed = order[state.aimIndex];
			if (aimed === undefined) return;
			const fits = aimed === state.carrying.slot;
			state.candidate = fits ? aimed : undefined;
			state.rejecting = fits ? undefined : aimed;
			callbacks.announce(
				fits
					? `${socketName(aimed)} socket — this one fits.`
					: `${socketName(aimed)} socket — the wrong shape.`
			);
		},

		placeAimed() {
			const carrying = state.carrying;
			if (carrying?.mode !== 'keyboard') return;
			const aimed = order[state.aimIndex];
			if (aimed === carrying.slot) {
				place(carrying);
				return;
			}
			callbacks.announce(
				`The ${carrying.name} does not fit the ${aimed ? socketName(aimed) : 'that'} socket.`
			);
		},

		cancel() {
			if (!state.carrying) return;
			callbacks.announce('Put back.');
			clear();
		}
	};
}
