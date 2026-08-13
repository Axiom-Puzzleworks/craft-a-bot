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
	'memory',
	'equipment',
	'perception',
	'mobility',
	'safety'
];

/** Where each socket lives on the chassis (03 §4.2), in the body's language. */
export const SOCKET_LABELS: Record<SlotId, string> = {
	brain: 'head',
	memory: 'backpack',
	equipment: 'belt',
	perception: 'visor',
	mobility: 'wheels',
	safety: 'chest'
};

/** The grid area each socket occupies on the baseplate. */
export const SOCKET_PLACEMENT: Record<SlotId, string> = {
	brain: 'head',
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
