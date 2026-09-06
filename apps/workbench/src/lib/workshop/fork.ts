import {
	brainTurnsThrough,
	DEFAULT_REQUEST_TIMEOUT_MS,
	DEFAULT_TICK_BUDGET,
	DEFAULT_TOKEN_BUDGET,
	type AnyAgentSpec,
	type EngineEvent,
	type PackRegistry,
	type RunOutcome,
	type RunRecord
} from '@craftabot/core';
import { persistRunSummary } from '@craftabot/governance/reports';
import { capabilitiesOf } from '$lib/bot-capabilities.js';
import { chooseBrain } from '$lib/brain.js';
import { packVersions } from '$lib/packs.js';
import { preferences } from '$lib/state/preferences.svelte.js';
import { browserPrincipal } from '$lib/state/principal.js';
import { createSessionView } from '$lib/state/session.svelte.js';
import type { Storage } from '$lib/state/storage.js';
import { recordTrace, type TraceRecorder } from '$lib/state/trace-recorder.js';

/**
 * **"Fork from this tick"** (WP66 stage C, `54-FORK-EXPLAIN.md` §4.5): a
 * new run that begins where a stored one was after `tick`, with the
 * origin's own spec and the Workshop's own brain for it — the demo brain
 * resumed at the turn the origin had reached, or the cartridge's provider
 * on its battery — run to the end through the same session view and
 * recorder the Play route uses, and stored as any run is, with
 * `forkedFrom` on its record and on its `run.started`.
 *
 * No overrides: the counterfactual build is the harness's (`craftabot fork
 * --kit`); the Workshop's fork answers "would it go the same way again from
 * here?" — with a scripted brain, the identity the core tests prove; with a
 * real one, whatever the model says this time. An approval the fork asks
 * for is granted, as the harness grants it: nobody is at the desk to
 * answer, and a fork parked on a question is a fork that never ends.
 */
export interface ForkResult {
	runId: string;
	forkedFrom: { runId: string; tick: number };
	outcome: RunOutcome;
	ticks: number;
}

/** The ticks the origin completed — the only ones a fork can keep. */
export function completedTicks(events: readonly EngineEvent[]): number[] {
	return events.filter((event) => event.type === 'tick.completed').map((event) => event.tick);
}

export async function forkStoredRun(
	storage: Storage,
	originId: string,
	tick: number,
	registry: PackRegistry
): Promise<ForkResult> {
	const origin = await storage.getRun(originId);
	if (!origin) throw new Error(`No run with id ${originId} is in the store.`);
	const events = (await storage.getEvents(originId)).map((row) => row.event);
	const completed = completedTicks(events);
	if (!completed.includes(tick))
		throw new Error(
			`The run completed turns ${completed.join(', ') || 'none'}; turn ${tick} is not one of them.`
		);

	const spec = origin.specSnapshot;
	const can = capabilitiesOf(spec, registry);
	const brain = chooseBrain(
		registry.getCartridge(can.cartridgeId),
		spec.goalCardId,
		registry,
		can,
		{
			startAt: brainTurnsThrough(events, tick)
		}
	);
	if (!brain.ok) throw new Error('This bot needs its battery before it can be forked.');

	const forkedFrom = { runId: originId, tick };
	const seen: EngineEvent[] = [];
	let recorder: TraceRecorder | undefined;
	let runId: string | undefined;
	const startedAt = new Date().toISOString();
	// The fork is a new run by whoever forked it (WP65) — the browser's principal, not the origin's.
	const principal = browserPrincipal(preferences.displayName);
	const view = createSessionView({
		spec,
		provider: brain.provider,
		forkFrom: { events, tick },
		principal,
		onEvent: (event) => {
			seen.push(event);
			if (event.type === 'run.started') {
				runId = event.runId;
				recorder = recordTrace(event.runId, storage);
				void storage.putRun(recordFor(event.runId, spec, seen, forkedFrom, startedAt));
			}
			recorder?.accept(event);
			if (event.type === 'approval.requested')
				queueMicrotask(() => view.resolveApproval(true, principal));
		}
	});

	const budget = origin.budgets.maxTicks + 10;
	for (let step = 0; step < budget && view.outcome === undefined; step += 1) {
		await view.step();
	}
	if (view.outcome === undefined) view.stop();
	await recorder?.stop();
	if (runId === undefined) throw new Error('The fork never started.');
	const outcome = view.outcome ?? 'STOPPED_BY_USER';
	const run = recordFor(runId, spec, seen, forkedFrom, startedAt, outcome);
	await storage.putRun(run);
	await persistRunSummary(storage, runId, [...seen]);
	return { runId, forkedFrom, outcome, ticks: run.ticks };
}

/** The fork's record, read from its own trace as the Play route reads a run's (hard rule 3). */
function recordFor(
	runId: string,
	spec: AnyAgentSpec,
	events: readonly EngineEvent[],
	forkedFrom: { runId: string; tick: number },
	startedAt: string,
	outcome?: RunOutcome
): RunRecord {
	const started = events.find((event) => event.type === 'run.started');
	const facts = started?.type === 'run.started' ? started.payload : undefined;
	let ticks = 0;
	const usage = { inputTokens: 0, outputTokens: 0 };
	for (const event of events) {
		if (event.tick > ticks) ticks = event.tick;
		if (event.type === 'think.completed') {
			usage.inputTokens += event.payload.response.usage.inputTokens;
			usage.outputTokens += event.payload.response.usage.outputTokens;
		}
	}
	return {
		id: runId,
		agentId: spec.id,
		agentName: spec.name,
		goalCardId: spec.goalCardId,
		specSnapshot: spec,
		packVersions: packVersions(),
		forkedFrom,
		mode: facts?.mode ?? 'step',
		outcome: outcome ?? 'IN_PROGRESS',
		ticks,
		usage,
		budgets: facts?.budgets ?? {
			maxTicks: DEFAULT_TICK_BUDGET,
			maxTokens: DEFAULT_TOKEN_BUDGET,
			requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS
		},
		providerId: facts?.providerId ?? 'unrecorded',
		wireModel: facts?.wireModel ?? 'unrecorded',
		pinned: false,
		startedAt,
		...(outcome ? { finishedAt: new Date().toISOString() } : {}),
		schemaVersion: 2
	};
}
