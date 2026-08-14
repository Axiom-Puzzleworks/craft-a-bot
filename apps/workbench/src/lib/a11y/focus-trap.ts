/**
 * **Keep the keyboard inside a card that has taken over the screen**
 * (`16-…` §2.7, closing the rest of `12-…` D16).
 *
 * The end card and the approval card both stop the world: nothing behind them
 * can be acted on, and the approval card is literally a question the run is
 * waiting on. For a mouse that is obvious, because the scrim is in the way. For
 * a keyboard it was not true at all — Tab walked straight out of the card and
 * off into the page underneath, where every control was either inert or, worse,
 * still live.
 *
 * An action rather than a component wrapper: the three cards that need this
 * already have their own markup and their own shapes, and the only thing they
 * share is the behaviour.
 */

const FOCUSABLE = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])'
].join(',');

export interface FocusTrapOptions {
	/**
	 * What to focus when the card appears. Defaults to the first focusable
	 * thing, which is right when the first thing is safe — and is why the
	 * take-apart confirm passes its Cancel button instead.
	 */
	initial?: () => HTMLElement | undefined;
	/** Escape, where the card has a safe way out. Absent means Escape does nothing. */
	onescape?: () => void;
}

/** Everything inside `root` the keyboard can reach, in document order. */
export function focusableWithin(root: HTMLElement): HTMLElement[] {
	return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
		// `offsetParent` is null for anything `display: none`; a visually-hidden
		// label is still reachable and should still be counted.
		(element) => element.offsetParent !== null || element.tabIndex >= 0
	);
}

/**
 * Svelte action. Moves focus in on mount, keeps Tab and Shift+Tab cycling
 * inside, and puts focus back where it came from when the card goes away —
 * without which dismissing an end card left the keyboard at the top of the
 * document with no idea where it had been.
 */
export function focusTrap(node: HTMLElement, options: FocusTrapOptions = {}) {
	let current = options;
	const returnTo =
		document.activeElement instanceof HTMLElement ? document.activeElement : undefined;

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && current.onescape) {
			event.preventDefault();
			current.onescape();
			return;
		}
		if (event.key !== 'Tab') return;

		const focusable = focusableWithin(node);
		if (focusable.length === 0) {
			// Nothing to move to, so the only correct thing is to stay put.
			event.preventDefault();
			return;
		}

		const first = focusable[0] as HTMLElement;
		const last = focusable[focusable.length - 1] as HTMLElement;
		const active = document.activeElement;

		if (event.shiftKey && (active === first || !node.contains(active))) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && (active === last || !node.contains(active))) {
			event.preventDefault();
			first.focus();
		}
	}

	const initial = current.initial?.() ?? focusableWithin(node)[0];
	initial?.focus();

	node.addEventListener('keydown', onKeydown);

	return {
		update(next: FocusTrapOptions) {
			current = next;
		},
		destroy() {
			node.removeEventListener('keydown', onKeydown);
			returnTo?.focus();
		}
	};
}
