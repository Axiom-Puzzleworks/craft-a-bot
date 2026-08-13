import type { BrickDefinition, SlotId } from '@craftabot/core';
import { starterBricks } from '@craftabot/pack-starter';

/**
 * The bench's view of the six brick types: which socket each one snaps into,
 * and the order they sit in the parts tray.
 *
 * The *content* (names, descriptions, flip-side copy) comes from the pack — this
 * is only the bench's arrangement of it, which is UI, not pack content.
 */

export type BrickKind = BrickDefinition['kind'];

/** Tray order, matching 03-UI-UX-DESIGN.md §4.1. */
export const BRICK_ORDER: BrickKind[] = ['llm', 'memory', 'tools', 'sense', 'actions', 'safety'];

/** Where each brick lives on the chassis (03 §4.2). */
export const SOCKET_LABELS: Record<BrickKind, string> = {
	llm: 'head',
	memory: 'backpack',
	tools: 'belt',
	sense: 'visor',
	actions: 'wheels',
	safety: 'chest'
};

export const brickDefinitions: Record<BrickKind, BrickDefinition> = Object.fromEntries(
	starterBricks.map((brick) => [brick.kind, brick])
) as Record<BrickKind, BrickDefinition>;

export function brickDefinition(kind: BrickKind): BrickDefinition {
	const definition = brickDefinitions[kind];
	if (!definition) throw new Error(`No brick definition installed for "${kind}".`);
	return definition;
}

/**
 * Core's socket names, in the bench's vocabulary (WP14 slice 3d).
 *
 * Build problems point at a `SlotId` now — the chassis socket — rather than at
 * one of V1's six brick names, because core has stopped knowing that the thing
 * in the equipment socket is called `tools`. The panels have not caught up yet;
 * they are keyed by brick name until slice 4 makes them schema-driven.
 *
 * So this is a door, in the same sense as the other translations this slice
 * leaves standing: one table, in the UI, that closes when the panels do.
 */
const PANEL_FOR_SLOT: Record<SlotId, BrickKind> = {
	brain: 'llm',
	memory: 'memory',
	equipment: 'tools',
	perception: 'sense',
	mobility: 'actions',
	safety: 'safety'
};

export function panelForSlot(slot: SlotId | undefined): BrickKind | undefined {
	return slot ? PANEL_FOR_SLOT[slot] : undefined;
}
