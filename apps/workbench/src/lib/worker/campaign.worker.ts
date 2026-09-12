import { packs } from '$edition-packs';
import { workshopPlans } from '$lib/workshop/plans.js';
import { createCampaignHost } from './campaign-host.js';
import type { WorkerRequest } from './protocol.js';

/**
 * **The module Worker** (WP77, `64-…` §6.6.1): the campaign runner off the
 * main thread, so a 930-cell desk baseline no longer wedges the tab
 * (UX-12). The packs are the edition's own list — the same module the main
 * thread's registry is built from (`59-…` §4.1) — and the plan chain is the
 * Workshop's (`lib/workshop/plans.ts`), so nothing about a cell differs by
 * which thread ran it. This file is the only one that touches the Worker
 * global; everything it does lives in `campaign-host.ts`, which a test runs
 * without a Worker.
 */
const scope = self as unknown as {
	postMessage(message: unknown): void;
	onmessage: ((event: { data: WorkerRequest }) => void) | null;
};

const host = createCampaignHost({ packs, plans: workshopPlans }, (reply) =>
	scope.postMessage(reply)
);

scope.onmessage = (event) => host.handle(event.data);
