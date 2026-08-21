/// <reference types="@testing-library/jest-dom" />
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';
import { EXPANSION_PACKS } from '$lib/expansion-packs.js';

describe('Shelf placeholder page', () => {
	it('renders the Craft A Bot heading', () => {
		render(Page);
		expect(screen.getByRole('heading', { name: 'Craft A Bot' })).toBeInTheDocument();
	});
});

describe('the kit line (WP33)', () => {
	it('lists every pack the kit-line table names, each with a real status pill', () => {
		render(Page);
		for (const pack of EXPANSION_PACKS) {
			const box = screen.getByTestId(`pack-${pack.id}`);
			expect(box).toHaveTextContent(pack.name);
			expect(box).toHaveTextContent(pack.status === 'unlocked' ? 'Unlocked!' : 'Coming soon');
		}
	});

	it('never claims Tool Shop is unlocked — its own content does not exist yet', () => {
		render(Page);
		expect(screen.getByTestId('pack-tool-shop')).toHaveTextContent('Coming soon');
	});

	it('shows the Agent Builder bundle as its own box, distinct from the packs', () => {
		render(Page);
		const bundle = screen.getByTestId('agent-builder-bundle');
		expect(bundle).toHaveTextContent('Agent Builder — the 5–11 kit');
		expect(screen.queryByTestId('pack-agent-builder')).not.toBeInTheDocument();
	});
});
