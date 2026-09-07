import type { ShippedCampaign } from '@craftabot/core';
import { injectionBaseline } from '@craftabot/evals';
import { installedPacks } from '$lib/packs.js';

/**
 * **Every campaign the installed packs ship** (UX-5, `docs/manual/UX-AND-GAPS.md`,
 * 2026-09-07). The Campaigns screen had one *Load baseline* button wired to
 * the injection baseline, and the four Playground campaigns could only be
 * imported from a file on disk — which a visitor to a published section does
 * not have. Packs contribute content (hard rule 4): each desk pack now names
 * its baseline on its manifest (`PackManifest.campaigns`), and this is that
 * list read back, with the Playroom's own injection baseline first because it
 * ships with the harness rather than with a pack.
 */
export interface ShippedCampaignEntry extends ShippedCampaign {
	/** The pack it came from — `starter` for the injection baseline. */
	packId: string;
}

export function shippedCampaigns(packs = installedPacks): ShippedCampaignEntry[] {
	const fromPacks = packs.flatMap((pack) =>
		(pack.campaigns ?? []).map((campaign) => ({ ...campaign, packId: pack.id }))
	);
	return [
		{
			id: 'injection-baseline',
			title: 'The injection baseline (Playroom)',
			description:
				'Four Playroom scenarios over twenty seeds — the campaign CI runs on every push.',
			packId: 'starter',
			campaign: () => injectionBaseline() as unknown as Record<string, unknown>
		},
		...fromPacks
	];
}

/**
 * The campaign a section should offer first: a desk's own in the Playground,
 * else the injection baseline. `preferred` is a campaign id from the URL or
 * the shelf; an unknown id falls back rather than failing.
 */
export function defaultShippedCampaign(
	entries: readonly ShippedCampaignEntry[],
	preferred?: string | null
): ShippedCampaignEntry | undefined {
	if (preferred) {
		const match = entries.find((entry) => entry.id === preferred);
		if (match) return match;
	}
	return entries[0];
}
