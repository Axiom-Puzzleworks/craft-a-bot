import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import TakeApartConfirm from './TakeApartConfirm.svelte';

/**
 * **The question in front of the Bin** (`16-…` §1.5, `12-…` D16).
 *
 * Binning was one tap: the most destructive action in the toy sat beside
 * Duplicate and Export at exactly the same weight.
 */
const props = (over: Partial<Record<string, unknown>> = {}) => ({
	botName: 'Bumble',
	onconfirm: () => {},
	oncancel: () => {},
	onexport: () => {},
	...over
});

describe('TakeApartConfirm', () => {
	it('asks about the bot by name, and promises what actually survives', () => {
		render(TakeApartConfirm, { props: props() });

		expect(screen.getByText('Take Bumble apart?')).toBeInTheDocument();
		expect(screen.getByText('Its adventures stay in the scrapbook.')).toBeInTheDocument();
	});

	it('takes the bot apart only when that is the answer given', async () => {
		const onconfirm = vi.fn();
		render(TakeApartConfirm, { props: props({ onconfirm }) });

		await fireEvent.click(screen.getByTestId('take-apart-confirm-yes'));

		expect(onconfirm).toHaveBeenCalledOnce();
	});

	it('keeps the bot when the answer is no', async () => {
		const oncancel = vi.fn();
		const onconfirm = vi.fn();
		render(TakeApartConfirm, { props: props({ oncancel, onconfirm }) });

		await fireEvent.click(screen.getByTestId('take-apart-cancel'));

		expect(oncancel).toHaveBeenCalledOnce();
		expect(onconfirm).not.toHaveBeenCalled();
	});

	/** The export nudge is the honest answer to "but I wanted to keep it". */
	it('offers to save the bot to a file before it goes', async () => {
		const onexport = vi.fn();
		render(TakeApartConfirm, { props: props({ onexport }) });

		await fireEvent.click(screen.getByTestId('take-apart-export'));

		expect(onexport).toHaveBeenCalledOnce();
	});

	/**
	 * Two halves of the same rule: the safe answer is the one you get by
	 * flinching. Escape cancels, and the focus starts on "Keep it" so a stray
	 * Enter or Space cannot destroy anything.
	 */
	/**
	 * Fired at the card, not the window. Escape belongs to the dialog now that
	 * the focus trap holds the keyboard inside it (`16-…` §2.7) — a global
	 * listener would also have fired for a key pressed somewhere else entirely.
	 */
	it('cancels on Escape', async () => {
		const oncancel = vi.fn();
		render(TakeApartConfirm, { props: props({ oncancel }) });

		await fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });

		expect(oncancel).toHaveBeenCalledOnce();
	});

	it('starts with the keyboard on the safe answer', () => {
		render(TakeApartConfirm, { props: props() });

		expect(screen.getByTestId('take-apart-cancel')).toHaveFocus();
	});

	it('announces itself as a decision that interrupts, not a passing message', () => {
		render(TakeApartConfirm, { props: props() });

		expect(screen.getByRole('alertdialog')).toBeInTheDocument();
	});
});
