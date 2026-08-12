import { expect, test } from '@playwright/test';

test('the Shelf page loads', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Craft A Bot' })).toBeVisible();
});
