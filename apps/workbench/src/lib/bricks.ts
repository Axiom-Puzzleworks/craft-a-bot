import { SLOT_IDS, type SlotId } from '@craftabot/core';

/**
 * **The bench's arrangement of the chassis** (WP14 slice 4b).
 *
 * This file used to be keyed by `BrickKind` — V1's six brick names, taken from
 * `BrickDefinition['kind']`, which is to say from a closed union in a pack. That
 * made the tray, the sockets, the drag-and-drop machine and the box lid all
 * things that could hold exactly six bricks and no seventh: `12-…` D11 in the
 * furniture rather than in the engine.
 *
 * It is keyed by **socket** now. Core owns the six slot families (`14-…` §2.3)
 * and a socket is a permanent feature of the chassis, so this is a fixed list
 * and always will be — but *what may go in one* comes from the registry, so an
 * expansion pack's brick reaches the tray without a line of this changing.
 *
 * The content — names, descriptions, flip-side copy — is the registered kind's
 * (`BrickKindDefinition`). All that is left here is where things sit and what
 * the parts of the body are called, which is genuinely the bench's business.
 */

/**
 * Tray and keyboard-navigation order (03-UI-UX-DESIGN.md §4.1).
 *
 * Deliberately *not* `SLOT_IDS`' own order: this is the order a builder meets
 * the bricks in, brain first and safety last, which is the order the leaflet
 * teaches and the parts tray has always shown.
 */
export const SLOT_ORDER: SlotId[] = [
	'brain',
	'planner',
	'memory',
	'equipment',
	'perception',
	'mobility',
	'safety'
];

/**
 * Which sockets have something in them, in the order a builder meets them.
 *
 * Keyed by **socket**, not by brick name: colour is keyed to the concept a
 * socket stands for (`04-…` §2.2), so a bot with a Monitor brick fitted is a
 * bot with governance on board and a strip that showed a gap there would be
 * lying about what is in the box.
 *
 * Lived in `routes/+page.svelte` until WP23, when the Workshop's fleet table
 * needed the identical strip. Two copies of this is two chances to disagree
 * about what a bot has fitted.
 */
export function filledSockets(bricks: readonly { slot: SlotId }[]): SlotId[] {
	const filled = new Set(bricks.map((brick) => brick.slot));
	return SLOT_ORDER.filter((slot) => filled.has(slot));
}

/** Where each socket lives on the chassis (03 §4.2), in the body's language. */
export const SOCKET_LABELS: Record<SlotId, string> = {
	brain: 'head',
	planner: 'shoulder',
	memory: 'backpack',
	equipment: 'belt',
	perception: 'visor',
	mobility: 'wheels',
	safety: 'chest'
};

/** The grid area each socket occupies on the baseplate. */
export const SOCKET_PLACEMENT: Record<SlotId, string> = {
	brain: 'head',
	planner: 'shoulder',
	perception: 'visor',
	memory: 'backpack',
	equipment: 'belt',
	safety: 'chest',
	mobility: 'wheels'
};

/** Everything `SLOT_ORDER` names is a real socket, and it names all of them. */
export function isSlot(value: string): value is SlotId {
	return (SLOT_IDS as readonly string[]).includes(value);
}
