/// <reference types="vite/client" />
import CampaignWorker from './campaign.worker.js?worker';
import type { WorkerLike } from './protocol.js';

/**
 * The one place a real Worker is constructed (WP77). Vite's `?worker`
 * import bundles `campaign.worker.ts` as its own module Worker chunk — the
 * edition's packs and the plan chain inside it — and hands back a
 * constructor. Kept apart from the runner store so unit tests, which run
 * under jsdom with no Worker, never import it.
 */
export function spawnCampaignWorker(): WorkerLike {
	return new CampaignWorker() as unknown as WorkerLike;
}
