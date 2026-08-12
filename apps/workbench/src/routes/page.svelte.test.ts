/// <reference types="@testing-library/jest-dom" />
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('Shelf placeholder page', () => {
	it('renders the Craft A Bot heading', () => {
		render(Page);
		expect(screen.getByRole('heading', { name: 'Craft A Bot' })).toBeInTheDocument();
	});
});
