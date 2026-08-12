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
