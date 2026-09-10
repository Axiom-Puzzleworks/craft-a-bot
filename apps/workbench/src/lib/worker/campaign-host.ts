import type { PackManifest } from '@craftabot/core';
import { parseCampaign, runCampaign, type PlanSource } from '@craftabot/evals';
import type { StartCampaign, WorkerReply, WorkerRequest } from './protocol.js';

/**
 * **The Worker's side** (WP77, `64-…` §6.6.1): the runner behind the
 * protocol, written as a plain function over `post` so it runs the same in
 * a module Worker (`campaign.worker.ts`) and in a test with no Worker at
 * all. It calls the very `runCampaign` the Campaigns screen used to call on
 * the main thread and the harness calls under Node — one runner, three
 * hosts (`65-…` §5 item 3) — with the same packs and the same plan chain,
 * so the report is byte-identical whichever thread made it.
 *
 * Jobs run one at a time in arrival order; a cancel lands at the next cell
 * boundary through the runner's own `betweenCells` yield, as it did on the
 * main thread (UX-12), and stores nothing — a partial report would be a
 * report over cells it never ran.
 */
export interface CampaignHostDeps {
	packs: PackManifest[];
	plans: PlanSource;
}

class CancelledError extends Error {}

export interface CampaignHost {
	handle(message: WorkerRequest): void;
}

export function createCampaignHost(
	deps: CampaignHostDeps,
	post: (reply: WorkerReply) => void
): CampaignHost {
	const cancelled = new Set<string>();
	let chain: Promise<void> = Promise.resolve();

	async function runOne(start: StartCampaign): Promise<void> {
		let progress = { done: 0, total: 0 };
		try {
			const campaign = parseCampaign(start.campaign);
			const report = await runCampaign(campaign, {
				packs: deps.packs,
				plans: deps.plans,
				...(start.fixed
					? { now: () => start.fixed?.now ?? '', newId: () => start.fixed?.reportId ?? '' }
					: {}),
				betweenCells: () =>
					new Promise<void>((resolveYield, rejectYield) =>
						setTimeout(
							() =>
								cancelled.has(start.job)
									? rejectYield(new CancelledError('cancelled'))
									: resolveYield(),
							0
						)
					),
				onCell: (_cell, done, total) => {
					progress = { done, total };
					post({ kind: 'progress', job: start.job, done, total });
				},
				onTrace: (cell, trace) => {
					post({ kind: 'trace', job: start.job, cell, events: trace.events, spec: trace.spec });
				}
			});
			post({ kind: 'done', job: start.job, report });
		} catch (error) {
			if (error instanceof CancelledError) {
				post({ kind: 'cancelled', job: start.job, ...progress });
			} else {
				post({
					kind: 'failed',
					job: start.job,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		} finally {
			cancelled.delete(start.job);
		}
	}

	return {
		handle(message) {
			if (message.kind === 'cancel') {
				cancelled.add(message.job);
				return;
			}
			if (message.work === 'campaign') {
				chain = chain.then(() => runOne(message));
				return;
			}
			// A book is a campaign with a `source` (WP80): the same runner runs it.
			if (message.work === 'book') {
				chain = chain.then(() =>
					runOne({
						kind: 'start',
						job: message.job,
						work: 'campaign',
						campaign: message.book,
						fixed: message.fixed
					})
				);
				return;
			}
			// The bank clock arrives with WP83; until then the protocol says so rather than pretending.
			post({
				kind: 'failed',
				job: message.job,
				error: `the ${message.work} runner is not built yet (WP83)`
			});
		}
	};
}
