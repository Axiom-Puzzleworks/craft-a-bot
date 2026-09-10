import { spawnCampaignWorker } from '$lib/worker/spawn.js';
import { envelopeFor } from '$lib/workshop/campaign-cells.js';
import { appStorage } from './app-storage.svelte.js';
import { createCampaignRunner } from './campaign-runner.svelte.js';

/**
 * The app's one campaign runner (WP77): the real Worker, the real storage.
 * Split from `campaign-runner.svelte.ts` so the store's tests never import
 * the `?worker` module, which jsdom cannot construct.
 */
export const campaignRunner = createCampaignRunner({
	spawn: spawnCampaignWorker,
	persist: async (report) => {
		const storage = await appStorage();
		await storage.putCampaignReport(envelopeFor(report));
	}
});
