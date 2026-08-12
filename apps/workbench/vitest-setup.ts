import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/svelte';
import { afterEach } from 'vitest';

/**
 * Testing Library only auto-registers its cleanup when Vitest runs with
 * `globals: true`, which this project does not. Without this, every component
 * test leaves its DOM behind and the next `getByTestId` finds several matches.
 */
afterEach(() => {
	cleanup();
});

/**
 * jsdom has no `ResizeObserver`. The leaflet's spotlight uses one to keep its
 * cut-out over an element that moves as bricks are fitted; a no-op stub is
 * enough here, because positioning is a browser concern and is covered by the
 * Playwright walk instead.
 */
if (!('ResizeObserver' in globalThis)) {
	globalThis.ResizeObserver = class {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	};
}
