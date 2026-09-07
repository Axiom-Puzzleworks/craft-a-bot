import { describe, expect, it } from 'vitest';
import type { PackManifest } from '@craftabot/core';
import { defaultShippedCampaign, shippedCampaigns } from './shipped-campaigns.js';

/**
 * Every campaign the installed packs ship is offered on the Campaigns screen
 * (UX-5): the injection baseline first, then each pack's own, in pack order.
 */
const pack = (id: string, campaigns?: PackManifest['campaigns']): PackManifest =>
	({ id, name: id, version: '0.0.1', ...(campaigns ? { campaigns } : {}) }) as PackManifest;

describe('shippedCampaigns', () => {
	it('offers the injection baseline even when no pack ships a campaign', () => {
		const entries = shippedCampaigns([pack('starter')]);
		expect(entries.map((entry) => entry.id)).toEqual(['injection-baseline']);
		expect(entries[0]?.campaign()).toMatchObject({ id: expect.any(String) });
	});

	it('lists each pack’s campaigns after it, named for the pack', () => {
		const entries = shippedCampaigns([
			pack('starter'),
			pack('fs-advice', [
				{ id: 'fs-advice-baseline', title: 'The Advice Desk baseline', campaign: () => ({}) },
				{
					id: 'fs-complaints-baseline',
					title: 'The Complaints Desk baseline',
					campaign: () => ({})
				}
			]),
			pack('fs-fraud', [
				{ id: 'fs-fraud-baseline', title: 'The Fraud Desk baseline', campaign: () => ({}) }
			])
		]);
		expect(entries.map((entry) => `${entry.packId}:${entry.id}`)).toEqual([
			'starter:injection-baseline',
			'fs-advice:fs-advice-baseline',
			'fs-advice:fs-complaints-baseline',
			'fs-fraud:fs-fraud-baseline'
		]);
	});
});

describe('defaultShippedCampaign', () => {
	const entries = shippedCampaigns([
		pack('fs-advice', [
			{ id: 'fs-advice-baseline', title: 'The Advice Desk baseline', campaign: () => ({}) }
		])
	]);

	it('is the one asked for when it is shipped', () => {
		expect(defaultShippedCampaign(entries, 'fs-advice-baseline')?.id).toBe('fs-advice-baseline');
	});

	it('falls back to the first entry for an unknown or absent id', () => {
		expect(defaultShippedCampaign(entries, 'nope')?.id).toBe('injection-baseline');
		expect(defaultShippedCampaign(entries)?.id).toBe('injection-baseline');
	});
});
