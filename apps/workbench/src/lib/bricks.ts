import type { BrickDefinition } from '@craftabot/core';
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
