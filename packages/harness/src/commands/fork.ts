import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	brainTurnsThrough,
	buildTraceFile,
	forkSession,
	type AgentSpecV2,
	type EgressMode,
	type EngineEvent,
	type Principal,
	type RunOutcome
} from '@craftabot/core';
import { summariseRun } from '@craftabot/governance/reports';
import { createRegistry, packVersions, type HarnessConfig } from '../config.js';
import type { CredentialSource } from '../credentials.js';
import { mulberry32 } from '../random.js';
import { runRecordFrom } from '../run-record.js';
import { createFileStorage } from '../storage/file-storage.js';
import { chooseBrain, loadSpecFrom, type BrainTier } from './run.js';

/**
 * `craftabot fork` (WP66 stage B, `54-FORK-EXPLAIN.md` §4.3): a new run that
 * begins where a stored one was after `--tick`, with the origin's own spec
 * (its run record's snapshot) or a kit's counterfactual one, its scripted
 * brain resumed where the origin left it, run to completion and written
 * exactly as `run` writes a run — plus a verdict on whether the fork
 * diverged from the origin, and at which tick, since "would a different
 * guard stack have declined it too?" wants an answer, not two traces.
 */
export interface ForkRunOptions {
	runId: string;
	/** The last tick the fork keeps; defaults to the origin's last completed tick but one. */
	tick?: number;
	/** A counterfactual build; absent, the origin's own spec. */
	kitPath?: string;
	brain: BrainTier;
	seed: number;
	out: string;
	approve?: boolean;
	config: HarnessConfig;
	credentials: CredentialSource;
	now?: () => string;
	newId?: () => string;
	egress?: EgressMode;
	/** Who is forking (WP65): the fork is a new run by whoever forked it, not the origin's principal. */
	principal?: Principal;
}

export interface ForkRunReport {
	runId: string;
	forkedFrom: { runId: string; tick: number };
	agentId: string;
	outcome: RunOutcome;
	ticks: number;
	events: number;
	directory: string;
	traceFile: string;
	/** Whether the fork's rows after the fork tick differ from the origin's in type, tick or payload, and where first. */
	divergence: { diverged: false } | { diverged: true; atTick: number; first: string };
	/** The narrower question: did the bot decide or do anything differently — a guard that only checks leaves this `same`. */
	acts: { same: true } | { same: false; atTick: number; first: string };
}

/** What the bot decided and did after `tick`: every decision's call and every performed call's name and verdict. */
export function actsAfter(
	origin: readonly EngineEvent[],
	fork: readonly EngineEvent[],
	tick: number
): ForkRunReport['acts'] {
	const acts = (events: readonly EngineEvent[]) =>
		events
			.filter((event) => event.tick > tick)
			.flatMap((event) => {
				if (event.type === 'decision')
					return [{ tick: event.tick, what: `decided ${event.payload.call?.name ?? 'nothing'}` }];
				if (event.type === 'action.performed')
					return [
						{
							tick: event.tick,
							what: `${event.payload.name} ${event.payload.result.ok ? 'ok' : 'failed'}`
						}
					];
				if (event.type === 'tool.executed')
					return [{ tick: event.tick, what: `${event.payload.name} ran` }];
				if (event.type === 'run.finished')
					return [{ tick: event.tick, what: `finished ${event.payload.outcome}` }];
				return [];
			});
	const a = acts(origin);
	const b = acts(fork);
	for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
		if (a[i]?.what !== b[i]?.what || a[i]?.tick !== b[i]?.tick) {
			return {
				same: false,
				atTick: Math.min(b[i]?.tick ?? Infinity, a[i]?.tick ?? Infinity),
				first: `${b[i] ? b[i]!.what : 'nothing'} on the fork against ${a[i] ? a[i]!.what : 'nothing'} on the origin`
			};
		}
	}
	return { same: true };
}

/**
 * What two rows are compared on: type, tick and payload — less the clock
 * (`durationMs`), less what says a run is a fork, and less *who* (WP65): a
 * fork is a new run by whoever forked it, so its attestations and `by`s
 * name the forker, and a divergence is about what the bot did, not who was
 * at the keyboard.
 */
const comparable = (event: EngineEvent) => ({
	type: event.type,
	tick: event.tick,
	payload:
		event.type === 'tool.executed'
			? { ...event.payload, durationMs: 0 }
			: event.type === 'run.started'
				? Object.fromEntries(
						Object.entries(event.payload).filter(
							([key]) => key !== 'forkedFrom' && key !== 'principal'
						)
					)
				: event.type === 'action.performed'
					? Object.fromEntries(
							Object.entries(event.payload).filter(([key]) => key !== 'attestation')
						)
					: event.type === 'approval.resolved'
						? { approved: event.payload.approved }
						: event.payload
});

/** Where two traces first part after `tick` — in type, tick or payload — or nowhere. */
export function divergenceAfter(
	origin: readonly EngineEvent[],
	fork: readonly EngineEvent[],
	tick: number
): ForkRunReport['divergence'] {
	const a = origin.filter((event) => event.tick > tick).map(comparable);
	const b = fork.filter((event) => event.tick > tick).map(comparable);
	for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
		const left = a[i];
		const right = b[i];
		if (JSON.stringify(left) !== JSON.stringify(right)) {
			const at = Math.min(right?.tick ?? Infinity, left?.tick ?? Infinity);
			return {
				diverged: true,
				atTick: at,
				first: `${right ? `${right.type} on the fork` : 'nothing on the fork'} against ${left ? `${left.type} on the origin` : 'nothing on the origin'}`
			};
		}
	}
	return { diverged: false };
}

export async function forkRun(options: ForkRunOptions): Promise<ForkRunReport> {
	const registry = createRegistry(options.config);
	const storage = await createFileStorage(options.out);
	const origin = await storage.getRun(options.runId);
	if (!origin) throw new Error(`no run '${options.runId}' in ${storage.root}`);
	const originEvents = (await storage.getEvents(options.runId)).map((row) => row.event);
	const completed = originEvents
		.filter((event) => event.type === 'tick.completed')
		.map((event) => event.tick);
	if (completed.length === 0)
		throw new Error(`run '${options.runId}' completed no tick to fork from`);
	const tick = options.tick ?? Math.max(1, (completed.at(-1) ?? 1) - 1);
	if (!completed.includes(tick))
		throw new Error(
			`run '${options.runId}' completed ticks ${completed.join(', ')}; --tick ${tick} is not one of them`
		);

	const originSpec = origin.specSnapshot as AgentSpecV2;
	const spec = options.kitPath
		? await loadSpecFrom(options.kitPath, options.config, registry)
		: originSpec;
	const { provider } = chooseBrain(spec, registry, {
		brain: options.brain,
		seed: options.seed,
		credentials: options.credentials,
		startAt: brainTurnsThrough(originEvents, tick)
	});

	const now = options.now ?? (() => new Date().toISOString());
	const session = forkSession(
		{
			spec: originSpec,
			registry,
			provider,
			getCredential: (id) => options.credentials.get(id),
			options: {
				now,
				random: mulberry32(options.seed),
				tickDelayMs: 0,
				...(options.newId ? { newId: options.newId } : {}),
				egress: options.egress ?? 'declared',
				...(options.principal ? { principal: options.principal } : {})
			}
		},
		{ from: { events: originEvents, tick }, ...(options.kitPath ? { overrides: { spec } } : {}) }
	);

	const events: EngineEvent[] = [];
	const startedAt = now();
	const versions = packVersions(options.config);
	session.events.onAny((event) => events.push(event));
	session.events.on('approval.requested', () =>
		session.resolveApproval(options.approve ?? true, options.principal)
	);
	session.start('step');
	let outcome: RunOutcome | undefined;
	const budget = origin.budgets.maxTicks;
	for (let step = 0; step < budget + 10 && outcome === undefined; step++) {
		const result = await session.step();
		if (result.outcome) outcome = result.outcome;
	}
	if (outcome === undefined) {
		session.stop('the harness gave up');
		outcome = 'STOPPED_BY_USER';
	}

	const run = {
		...runRecordFrom({
			runId: session.runId,
			spec,
			events,
			packVersions: versions,
			startedAt,
			finishedAt: now(),
			outcome
		}),
		forkedFrom: { runId: options.runId, tick }
	};
	await storage.putAgent({
		id: spec.id,
		spec,
		lastValidation: [],
		createdAt: spec.createdAt,
		updatedAt: spec.updatedAt,
		schemaVersion: 2
	});
	await storage.putRun(run);
	await storage.appendEvents(session.runId, events);
	await storage.putRunSummary(summariseRun(session.runId, events));
	const trace = await buildTraceFile(run, events, { secrets: options.credentials.secrets() });
	const traceFile = join(
		options.out,
		'runs',
		session.runId,
		`${session.runId}.craftabot-trace.json`
	);
	await writeFile(traceFile, `${JSON.stringify(trace, null, '\t')}\n`, 'utf8');

	return {
		runId: session.runId,
		forkedFrom: { runId: options.runId, tick },
		agentId: spec.id,
		outcome,
		ticks: run.ticks,
		events: events.length,
		directory: join(options.out, 'runs', session.runId),
		traceFile,
		divergence: divergenceAfter(originEvents, events, tick),
		acts: actsAfter(originEvents, events, tick)
	};
}
