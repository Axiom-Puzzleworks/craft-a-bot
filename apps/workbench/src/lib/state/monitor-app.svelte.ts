import { spawnCampaignWorker } from '$lib/worker/spawn.js';
import { createRegistry } from '$lib/packs.js';
import { createMonitor } from './monitor.svelte.js';

/**
 * The app's Monitor (WP84): its own Worker from the same module the campaign
 * runner spawns, so a day at the bank never queues behind a campaign and a
 * campaign never waits on the Monitor. Split from `monitor.svelte.ts` so
 * the store's tests never import the `?worker` module, which jsdom cannot
 * construct.
 */
const registry = createRegistry();

export const monitor = createMonitor({
	spawn: spawnCampaignWorker,
	decisionKindOf: (workflowId) => registry.getWorkflow(workflowId)?.decisionKindOf
});
