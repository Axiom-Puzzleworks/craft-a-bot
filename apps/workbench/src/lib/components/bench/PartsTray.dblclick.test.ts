import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { createDndController } from '$lib/dnd/dnd-state.svelte.js';
import PartsTray from './PartsTray.svelte';

/**
 * A double-click fits a brick without the drag (2026-09-03, `03-…` §4.1's
 * dated note): `onfit` is called with the kind, and not for a well whose
 * socket is already taken, nor while a brick is being carried.
 */
function mount(fitted: Record<string, { kindId: string; name: string }> = {}) {
	const onfit = vi.fn();
	const controller = createDndController({
		onPlace: () => {},
		onRemove: () => {},
		announce: () => {}
	});
	render(PartsTray, {
		props: {
			controller,
			fittedIn: (slot: string) => fitted[slot],
			onselect: () => {},
			onfit
		}
	});
	return { onfit, controller };
}

describe('the tray’s double-click', () => {
	it('fits the brick whose well was double-clicked', async () => {
		const { onfit } = mount();
		await fireEvent.dblClick(screen.getByTestId('tray-starter/llm'));
		expect(onfit).toHaveBeenCalledWith('starter/llm');
	});

	it('does nothing for a well whose socket is taken, or while carrying', async () => {
		const { onfit } = mount({ brain: { kindId: 'starter/llm', name: 'Brain Brick' } });
		await fireEvent.dblClick(screen.getByTestId('tray-starter/llm'));
		expect(onfit).not.toHaveBeenCalled();

		const carrying = mount();
		carrying.controller.liftWithKeyboard(
			{ kindId: 'starter/memory', slot: 'memory', name: 'Scrapbook Brick' },
			'tray'
		);
		await fireEvent.dblClick(screen.getAllByTestId('tray-starter/sense')[1]!);
		expect(carrying.onfit).not.toHaveBeenCalled();
	});

	it('says how, under the wells', () => {
		mount();
		expect(screen.getAllByTestId('parts-tray-hint')[0]?.textContent).toContain('double-click');
	});
});
