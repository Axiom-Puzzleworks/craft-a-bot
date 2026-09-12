import {
	buildTraceBundle,
	evidenceItemFor,
	runRecordFrom,
	toSpecV2,
	type BankRun,
	type EngineEvent,
	type EvidenceStoreInstance,
	type WorkItem,
	type WorkflowRun
} from '@craftabot/core';
import type { MonitorSink } from './bank.js';

/**
 * **The ingest seam** (WP84, `75-THE-MONITOR.md` §6; `64-…` §6.5.3): the
 * second `MonitorSink`, writing a day's artefacts to an evidence store
 * (`58-…`) — every workflow run as a `workflow-run` item under its id,
 * every agent run as a one-run `bundle` under its run id, the `BankRun`
 * as a `bank-run` — and the reader that pulls the same kinds back by date
 * into the Monitor's fold. A feed of the same artefacts from bots running
 * elsewhere would draw on the same screen. Designed and tested against
 * the memory store; never connected to a live feed by this WP.
 */
export interface EvidenceSinkOptions {
	/** Whose push it is — on every item's `pushedBy` and the bundle's `exportedBy`. */
	principal?: string | undefined;
	/** The wall clock for `pushedAt`; the store's own otherwise. */
	now?: (() => number) | undefined;
	packVersions?: Record<string, string> | undefined;
	secrets?: readonly string[] | undefined;
}

export function evidenceMonitorSink(
	store: EvidenceStoreInstance,
	options: EvidenceSinkOptions = {}
): MonitorSink {
	const itemOptions = {
		...(options.now ? { now: options.now } : {}),
		...(options.principal !== undefined ? { principal: options.principal } : {})
	};
	return {
		async workflowRun(entry) {
			await store.push(await evidenceItemFor('workflow-run', entry.run.id, entry.run, itemOptions));
		},
		async agentRun(entry) {
			const spec = toSpecV2(entry.spec);
			const finished = entry.events.find((event) => event.type === 'run.finished');
			const outcome = finished?.type === 'run.finished' ? finished.payload.outcome : undefined;
			const startedAt = entry.events[0]?.timestamp ?? new Date(0).toISOString();
			const finishedAt = entry.events.at(-1)?.timestamp ?? startedAt;
			const run = runRecordFrom({
				runId: entry.runId,
				spec,
				events: entry.events,
				packVersions: options.packVersions ?? {},
				startedAt,
				finishedAt,
				...(outcome ? { outcome } : {})
			});
			const bundle = await buildTraceBundle({
				runs: [{ run, events: entry.events }],
				exportedBy: options.principal ?? 'evidence-sink',
				exportedAt: finishedAt,
				secrets: [...(options.secrets ?? [])]
			});
			await store.push(await evidenceItemFor('bundle', entry.runId, bundle, itemOptions));
		},
		async bankRun(record) {
			await store.push(await evidenceItemFor('bank-run', record.id, record, itemOptions));
		}
	};
}

export interface EvidenceMonitorQuery {
	/** ISO dates, inclusive, against each workflow run's simulated `startedAt`. */
	from: string;
	to: string;
	/** Only items pushed after this wall time — a poll's cursor. */
	since?: string | undefined;
	limit?: number | undefined;
}

export interface EvidenceMonitorRun {
	desk: string;
	item: WorkItem;
	run: WorkflowRun;
	agentEvents: EngineEvent[];
}

/**
 * The workflow runs in the store whose simulated start falls in the window,
 * each with the events of the bundles its `runIds` name. A workflow run
 * carries its item's id and not the item; the desk and the item come from
 * the `BankRun`s in the store when one lists the run, or stay as the run
 * says (`workflowId` for the desk, an item shell) when none does.
 */
export async function* monitorRunsFromEvidence(
	store: EvidenceStoreInstance,
	query: EvidenceMonitorQuery
): AsyncIterable<EvidenceMonitorRun> {
	const deskOf = new Map<string, { desk: string; kind: WorkItem['kind'] }>();
	for await (const item of store.pull({ kind: 'bank-run' })) {
		if (item.kind !== 'bank-run') continue;
		for (const run of item.payload.runs) deskOf.set(run.runId, { desk: run.desk, kind: run.kind });
	}
	const pulled = store.pull({
		kind: 'workflow-run',
		...(query.since !== undefined ? { since: query.since } : {}),
		...(query.limit !== undefined ? { limit: query.limit } : {})
	});
	for await (const item of pulled) {
		if (item.kind !== 'workflow-run') continue;
		const run = item.payload;
		const day = run.startedAt.slice(0, 10);
		if (day < query.from || day > query.to) continue;
		const agentEvents: EngineEvent[] = [];
		for (const runId of run.runIds) {
			for await (const bundle of store.pull({ kind: 'bundle', id: runId })) {
				if (bundle.kind !== 'bundle') continue;
				for (const trace of bundle.payload.runs) agentEvents.push(...trace.events);
			}
		}
		const listed = deskOf.get(run.id);
		yield {
			desk: listed?.desk ?? run.workflowId,
			item: {
				id: run.itemId,
				kind: listed?.kind ?? 'application',
				customerId: 'unlisted',
				arrivedAt: run.startedAt,
				payload: {},
				truth: { records: [] }
			},
			run,
			agentEvents
		};
	}
}

/** The `BankRun`s in the store, newest push last. */
export async function bankRunsFromEvidence(store: EvidenceStoreInstance): Promise<BankRun[]> {
	const records: BankRun[] = [];
	for await (const item of store.pull({ kind: 'bank-run' })) {
		if (item.kind === 'bank-run') records.push(item.payload);
	}
	return records;
}
