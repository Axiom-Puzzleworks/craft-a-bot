import {
	createPackRegistry,
	toSpecV2,
	type AnyAgentSpec,
	type Book,
	type EngineEvent,
	type Guardrail,
	type PackManifest
} from '@craftabot/core';
import { createMockProvider } from '@craftabot/core/testing';
import {
	parseCampaign,
	runCampaign,
	scriptedOptimal,
	specFor,
	type PlanSource
} from '@craftabot/evals';
import { compilePolicyCard } from '@craftabot/governance';
import {
	adviceRequestBook,
	alertBook,
	bankClock,
	complaintBook,
	defaultArrivalRates,
	population
} from '@craftabot/pack-fs-bank';
import { memorySink, runBank, type DeskAssignment } from '@craftabot/workflow';
import type { StartBank, StartCampaign, WorkerReply, WorkerRequest } from './protocol.js';

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

	/** A day at the bank (WP83): the books drawn from the packs' population, the desks worked, every trace posted, the day posted last. */
	async function runBankDay(start: StartBank): Promise<void> {
		try {
			const job = start.bank;
			const registry = createPackRegistry();
			for (const pack of deps.packs) registry.registerPack(pack);
			const pop = population(job.population.seed, { size: job.population.size });
			const books: Book[] = [];
			const wanted = new Set(job.desks.flatMap((desk) => desk.kinds));
			for (const desk of job.desks) {
				const workflow = registry.getWorkflow(desk.workflowId);
				if (
					workflow?.book &&
					desk.kinds.includes('application') &&
					!books.some((b) => b.kind === 'application')
				) {
					books.push(workflow.book({ seed: job.population.seed, size: job.population.size }));
				}
			}
			if (wanted.has('alert')) books.push(alertBook(pop, { from: job.from, to: job.to }).book);
			if (wanted.has('complaint')) books.push(complaintBook(pop, { from: job.from, to: job.to }));
			if (wanted.has('advice-request'))
				books.push(adviceRequestBook(pop, { from: job.from, to: job.to }));
			const acceleration = job.acceleration ?? Infinity;
			const rates = defaultArrivalRates(pop);
			const desks: DeskAssignment[] = job.desks.map((desk) => ({
				id: desk.id,
				workflowId: desk.workflowId,
				kinds: [...desk.kinds],
				...(desk.configuration !== undefined ? { configuration: desk.configuration } : {}),
				...(desk.knobs ? { config: { knobs: desk.knobs } } : {}),
				concurrency: desk.concurrency,
				build: desk.build ?? desk.configuration ?? 'default'
			}));
			const specs = new Map<string, AnyAgentSpec>();
			for (const desk of desks) {
				const world = registry.getWorld(registry.getWorkflow(desk.workflowId)?.worldId ?? '');
				specs.set(
					desk.id,
					specFor({
						scenario: {
							id: desk.id,
							goalCardId: desk.workflowId,
							tags: [],
							injections: [],
							fit: []
						},
						build: {
							id: desk.build,
							base: { kind: 'starter-default' },
							overrides: {
								senses: (world?.senses ?? []).map((sense) => sense.id),
								actions: (world?.actions ?? []).map((action) => action.id)
							}
						},
						guard: { id: 'none', fit: [] }
					})
				);
			}
			const sink = memorySink();
			const eventsByRun = new Map<string, readonly EngineEvent[]>();
			const record = await runBank(
				bankClock({
					population: pop,
					from: job.from,
					to: job.to,
					books,
					acceleration,
					seed: job.population.seed
				}),
				desks,
				{
					...sink,
					workflowRun: (entry) => {
						sink.workflowRun(entry);
						post({
							kind: 'workflow-run',
							job: start.job,
							desk: entry.desk,
							item: entry.item,
							run: entry.run,
							events: entry.run.runIds.flatMap((runId) => eventsByRun.get(runId) ?? [])
						});
					},
					agentRun: (entry) => {
						sink.agentRun(entry);
						eventsByRun.set(entry.runId, entry.events);
						post({
							kind: 'trace',
							job: start.job,
							cell: bankCell(entry.desk, entry.itemId),
							events: entry.events,
							spec: toV2(entry.spec)
						});
					}
				},
				{
					packs: deps.packs,
					workflows: registry.listWorkflows(),
					specFor: (desk) => specs.get(desk.id) as AnyAgentSpec,
					providerFor: (_desk, _stage, goalCardId) =>
						createMockProvider({
							script: scriptedOptimal(deps.plans.planFor(goalCardId)),
							id: 'scripted-optimal'
						}),
					guardrailsFor: (cardIds) =>
						cardIds.flatMap((id): Guardrail[] => {
							const card = registry.getPolicyCard(id);
							return card ? compilePolicyCard(card) : [];
						}),
					seed: job.population.seed,
					clock: {
						from: job.from,
						to: job.to,
						seed: job.population.seed,
						acceleration: Number.isFinite(acceleration) ? acceleration : 'Infinity',
						rates: Object.fromEntries(
							Object.entries(rates).map(([kind, rate]) => [
								kind,
								{ profile: [...rate.profile], scale: rate.scale }
							])
						),
						books: books.map((book) => ({
							kind: book.kind,
							items: book.items.length,
							populationDigest: book.source.populationDigest
						}))
					},
					populationDigest: pop.digest,
					newId: () =>
						`bank-${job.population.seed}-${job.from}${job.to !== job.from ? `-${job.to}` : ''}`,
					...(job.stopAfter !== undefined ? { stopAfter: job.stopAfter } : {}),
					onArrival: (arrival, desk) =>
						post({
							kind: 'arrival',
							job: start.job,
							...(desk !== undefined ? { desk } : {}),
							itemId: arrival.item.id,
							itemKind: arrival.item.kind,
							at: arrival.at
						}),
					onProgress: (progress) =>
						post({
							kind: 'progress',
							job: start.job,
							done: progress.worked,
							total: progress.arrived
						})
				}
			);
			post({ kind: 'bank-done', job: start.job, bank: record, runs: sink.workflowRuns });
		} catch (error) {
			post({
				kind: 'failed',
				job: start.job,
				error: error instanceof Error ? error.message : String(error)
			});
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
			// A day at the bank (WP83).
			chain = chain.then(() => runBankDay(message));
		}
	};
}

/** A bank day's agent run as a cell for the Run Lab: the desk as the scenario, the item as the seed's place. */
function bankCell(desk: string, itemId: string): import('@craftabot/evals').CampaignCell {
	return {
		scenario: desk,
		build: 'bank',
		guard: 'none',
		brain: 'scripted-optimal',
		tier: 'scripted-optimal',
		seed: 0,
		tags: [],
		metrics: {
			outcome: 'SUCCESS',
			ticksUsed: 0,
			tokensIn: 0,
			tokensOut: 0,
			loop: { longestStreak: 0, repeatedFailures: 0 },
			wastedTickRatio: 0,
			namingMisses: 0,
			namingAmbiguities: 0,
			guardrailTrips: {},
			approvalsRequested: 0,
			approvalsDenied: 0
		},
		assertions: {},
		evaluations: {},
		labels: {},
		caseMetrics: {},
		item: { id: itemId, kind: 'application', customerId: '' }
	};
}

function toV2(spec: AnyAgentSpec) {
	return 'bricks' in spec && Array.isArray(spec.bricks)
		? (spec as import('@craftabot/core').AgentSpecV2)
		: toSpecV2(spec);
}
