import { expect, test } from '@playwright/test';
import { skipTutorial } from './support.js';

test.beforeEach(async ({ page }) => skipTutorial(page));

test('the Shelf page loads', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Craft A Bot' })).toBeVisible();
});
