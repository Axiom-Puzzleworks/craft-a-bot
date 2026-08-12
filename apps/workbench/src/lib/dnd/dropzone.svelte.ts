import type { Attachment } from 'svelte/attachments';
import type { BrickKind } from '$lib/bricks.js';
import type { DndController } from './dnd-state.svelte.js';

/**
 * Registers a socket with the controller so it can be measured during a drag
 * and stepped through by the arrow keys (05-TECH-STACK.md §5).
 *
 * The socket does not decide anything itself — `geometry.ts` does, from the
 * rectangles collected here. Registration order is the keyboard traversal
 * order, which is why sockets are rendered in tray order.
 */
export function dropzone(kind: BrickKind, controller: DndController): Attachment<HTMLElement> {
	return (node) => controller.registerSocket(kind, node);
}
