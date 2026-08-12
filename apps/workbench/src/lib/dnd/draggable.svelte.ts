import type { Attachment } from 'svelte/attachments';
import type { BrickKind } from '$lib/bricks.js';
import type { CarryState, DndController } from './dnd-state.svelte.js';
import { DRAG_THRESHOLD, distance, type Point } from './geometry.js';

/**
 * Makes an element liftable (05-TECH-STACK.md §5). Thin on purpose: it captures
 * the pointer and forwards positions to the controller, which owns every
 * decision. Keyboard pick-up drives the same controller from the component's
 * own key handler, so there is one machine, not two.
 *
 * A press only becomes a drag once the pointer has moved `DRAG_THRESHOLD`.
 * Below that it stays an ordinary click — otherwise clicking a fitted brick to
 * open its panel would be read as dragging it off the baseplate.
 */

export interface DraggableOptions {
	kind: BrickKind;
	origin: CarryState['origin'];
	controller: DndController;
	disabled?: () => boolean;
}

export function draggable(options: DraggableOptions): Attachment<HTMLElement> {
	return (node) => {
		let pressedAt: Point | undefined;

		function onPointerDown(event: PointerEvent): void {
			if (options.disabled?.() === true) return;
			// Primary button / single touch only — a right-click is not a drag.
			if (event.button !== 0) return;

			pressedAt = { x: event.clientX, y: event.clientY };
			node.setPointerCapture(event.pointerId);
			// Deliberately no preventDefault here: it would swallow the click that
			// follows a press-without-drag, which is how panels are opened.
		}

		function onPointerMove(event: PointerEvent): void {
			const at = { x: event.clientX, y: event.clientY };

			if (!options.controller.carrying) {
				if (!pressedAt) return;
				if (distance(pressedAt, at) < DRAG_THRESHOLD) return;
				options.controller.liftWithPointer(options.kind, options.origin, at);
			}

			// Now that it is a real drag, stop the browser selecting text under it.
			event.preventDefault();
			options.controller.movePointer(at);
		}

		function onPointerUp(event: PointerEvent): void {
			pressedAt = undefined;
			if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
			// Never dragged? Leave it alone and let the click through.
			if (!options.controller.carrying) return;
			options.controller.dropPointer();
		}

		function onPointerCancel(): void {
			pressedAt = undefined;
			options.controller.cancel();
		}

		node.addEventListener('pointerdown', onPointerDown);
		node.addEventListener('pointermove', onPointerMove);
		node.addEventListener('pointerup', onPointerUp);
		node.addEventListener('pointercancel', onPointerCancel);

		return () => {
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('pointermove', onPointerMove);
			node.removeEventListener('pointerup', onPointerUp);
			node.removeEventListener('pointercancel', onPointerCancel);
		};
	};
}
