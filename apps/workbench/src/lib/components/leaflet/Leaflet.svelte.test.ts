import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { WebStorageLike } from '$lib/state/keys.js';
import { createLeaflet } from '$lib/leaflet/leaflet.svelte.js';
import { createSettingsStore } from '$lib/state/settings.js';
import Leaflet from './Leaflet.svelte';

/**
 * The panel itself. Mostly this exists to prove the controller's state actually
 * reaches the DOM — the chapter model and the controller are tested elsewhere,
 * but neither of those would notice a reactivity break between them.
 */

function fakeStore(): WebStorageLike {
	const map = new Map<string, string>();
	return {
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => void map.set(key, value),
		removeItem: (key) => void map.delete(key)
	};
}

const build = () => createLeaflet({ settings: createSettingsStore(fakeStore()) });

describe('the leaflet panel', () => {
	it('opens on chapter one for a first-timer', () => {
		render(Leaflet, { props: { leaflet: build() } });
		expect(screen.getByTestId('leaflet-title')).toHaveTextContent('A brain with no hands');
	});

	it('closes when the reader closes it, and offers the handle instead', async () => {
		render(Leaflet, { props: { leaflet: build() } });

		await fireEvent.click(screen.getByTestId('leaflet-close'));

		expect(screen.queryByTestId('leaflet')).toBeNull();
		expect(screen.getByTestId('leaflet-handle')).toBeInTheDocument();
	});

	it('reopens from the handle', async () => {
		render(Leaflet, { props: { leaflet: build() } });
		await fireEvent.click(screen.getByTestId('leaflet-close'));
		await fireEvent.click(screen.getByTestId('leaflet-handle'));

		expect(screen.getByTestId('leaflet')).toBeInTheDocument();
	});

	it('marks exactly one step as current', () => {
		render(Leaflet, { props: { leaflet: build() } });
		expect(document.querySelectorAll('[data-current="true"]')).toHaveLength(1);
	});
});
