import { describe, expect, it } from 'vitest';
import type { BotCapabilities, EngineEvent, RunRecord, SlotId } from '@craftabot/core';
import { incidentsFrom, incidentsFromSummaries } from './incidents.js';
import {
	autonomyTelemetry,
	autonomyTelemetryFromSummaries,
	guardrailMix,
	guardrailMixFromSummaries
} from './telemetry.js';
import { safetyCaseFor, safetyCaseFromSummaries } from './safety-case.js';
import { safetyTally } from './safety-tally.js';
import { summariesOf, summariseRun } from './summary.js';

/**
 * **One fold, and the proof that the two paths agree** (WP36 stage C).
 *
 * Every report kept its event-taking signature and became a wrapper over the
 * summary path. That is what makes "the screens read summaries now" a
 * refactor rather than a rewrite — but only if a summary really does carry
 * everything the reports used to read straight off the trace. The second
 * half of this file holds that as a property over fixture runs built to hit
 * every counted event: fold the events, or fold the summary, and the report
 * is the same.
 */

const AGENT = '22222222-2222-4222-8222-222222222222';
let seq = 0;
function event(
	runId: string,
	tick: number,
	type: EngineEvent['type'],
	payload: unknown
): EngineEvent {
	seq += 1;
	return {
		id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
		runId,
		agentId: AGENT,
		tick,
		timestamp: '2026-09-02T09:00:00.000Z',
		type,
		payload
	} as EngineEvent;
}

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

function run(id: string, outcome: RunRecord['outcome'], startedAt: string): RunRecord {
	return {
		id,
		agentId: AGENT,
		agentName: 'Snackbot 3000',
		goalCardId: 'starter/snack',
		specSnapshot: {
			id: AGENT,
			name: 'Snackbot 3000',
			bricks: {},
			goalCardId: 'starter/snack',
			createdAt: startedAt,
			updatedAt: startedAt,
			schemaVersion: 1
		},
		packVersions: { starter: '0.3.0' },
		mode: 'step',
		outcome,
		ticks: 4,
		usage: { inputTokens: 100, outputTokens: 40 },
		budgets: { maxTicks: 30, maxTokens: 100000, requestTimeoutMs: 60000 },
		providerId: 'mock',
		wireModel: 'mock-1',
		pinned: false,
		startedAt,
		schemaVersion: 2
	};
}

/** A run that touches every counted event at least once. */
function busyRun(runId: string): EngineEvent[] {
	const checked = (tick: number, allow: boolean) =>
		event(runId, tick, 'guardrail.checked', {
			guardrailId: 'safety/action-blocklist',
			hook: 'pre-act',
			verdict: allow ? { allow: true } : { allow: false, reason: 'no', disposition: 'block-action' }
		});
	return [
		event(runId, 0, 'run.started', {}),
		event(runId, 1, 'decision', {
			thought: 'go',
			call: { kind: 'action', name: 'move' },
			source: 'brain'
		}),
		event(runId, 1, 'guardrail.external', {
			guardrailId: 'geap/armor:decision',
			hook: 'pre-act',
			service: 'model-armor',
			endpoint: 'https://modelarmor.europe-west2.rep.googleapis.com/x',
			template: 't',
			latencyMs: 80,
			charsScreened: 20,
			outcome: 'ok'
		}),
		checked(1, true),
		event(runId, 1, 'action.performed', {
			name: 'move',
			arguments: {},
			result: { ok: false, narration: 'Bump.' }
		}),
		event(runId, 2, 'decision', {
			thought: 'open',
			call: { kind: 'action', name: 'open' },
			source: 'brain'
		}),
		checked(2, false),
		event(runId, 2, 'guardrail.tripped', {
			guardrailId: 'safety/action-blocklist',
			hook: 'pre-act',
			reason: 'Opening is blocked.',
			disposition: 'block-action'
		}),
		event(runId, 3, 'decision', { thought: 'mumble', call: null, source: 'brain' }),
		event(runId, 3, 'approval.requested', {
			proposed: { kind: 'action', name: 'give', arguments: {} },
			reason: 'Ask first.'
		}),
		event(runId, 3, 'approval.resolved', { approved: false }),
		event(runId, 4, 'approval.requested', {
			proposed: { kind: 'action', name: 'say', arguments: {} },
			reason: 'Ask first.'
		}),
		event(runId, 4, 'approval.resolved', { approved: true }),
		event(runId, 4, 'guardrail.tripped', {
			guardrailId: 'safety/step-budget',
			hook: 'pre-think',
			reason: 'Out of steps.',
			disposition: 'stop-run'
		}),
		event(runId, 4, 'error', { message: 'Boom.' }),
		event(runId, 4, 'run.finished', { outcome: 'STOPPED_BY_GUARDRAIL' })
	];
}

describe('summariseRun', () => {
	it('counts every fact the reports read, once', () => {
		const summary = summariseRun(uuid(1), busyRun(uuid(1)));

		expect(summary.checks).toBe(2);
		expect(summary.saves).toBe(2);
		expect(summary.guardrailTrips).toEqual({
			'safety/action-blocklist': 1,
			'safety/step-budget': 1
		});
		expect(summary.approvalsRequested).toBe(2);
		expect(summary.approvalsGranted).toBe(1);
		expect(summary.decisions).toBe(2);
		expect(summary.hostedPreActScreens).toBe(1);
		expect(summary.findings.map((f) => f.kind)).toEqual([
			'action-failure',
			'guardrail-catch',
			'approval-denied',
			'guardrail-catch',
			'error',
			'run-failure'
		]);
		expect(summary.findings[2]?.summary).toBe('A person said no: Ask first.');
		expect(summary.schemaVersion).toBe(1);
	});

	it('agrees with the safety tally it replaces', () => {
		const events = busyRun(uuid(1));
		const summary = summariseRun(uuid(1), events);
		expect({ checks: summary.checks, saves: summary.saves }).toEqual(safetyTally(events));
	});

	it('is empty for a run with no events', () => {
		const summary = summariseRun(uuid(2), []);
		expect(summary).toEqual({
			runId: uuid(2),
			checks: 0,
			saves: 0,
			guardrailTrips: {},
			approvalsRequested: 0,
			approvalsGranted: 0,
			findings: [],
			decisions: 0,
			hostedPreActScreens: 0,
			schemaVersion: 1
		});
	});
});

describe('the events path and the summary path agree', () => {
	const runs = [
		run(uuid(1), 'STOPPED_BY_GUARDRAIL', '2026-09-01T10:00:00Z'),
		run(uuid(2), 'SUCCESS', '2026-09-02T10:00:00Z'),
		run(uuid(3), 'IN_PROGRESS', '2026-09-03T10:00:00Z')
	];
	const eventsByRun = new Map<string, readonly EngineEvent[]>([
		[uuid(1), busyRun(uuid(1))],
		[
			uuid(2),
			[
				event(uuid(2), 0, 'run.started', {}),
				event(uuid(2), 1, 'run.finished', { outcome: 'SUCCESS' })
			]
		],
		[uuid(3), [event(uuid(3), 0, 'run.started', {})]]
	]);
	const summaries = summariesOf(runs, eventsByRun);

	it('for the incident log', () => {
		expect(incidentsFromSummaries(runs, summaries)).toEqual(incidentsFrom(runs, eventsByRun));
		expect(incidentsFrom(runs, eventsByRun).map((i) => i.runId)).toEqual([uuid(1)]);
	});

	it('for the guardrail trip mix', () => {
		expect(guardrailMixFromSummaries(summaries.values())).toEqual(guardrailMix(eventsByRun));
	});

	it('for autonomy telemetry', () => {
		expect(autonomyTelemetryFromSummaries(runs, summaries.values())).toEqual(
			autonomyTelemetry(runs, eventsByRun)
		);
	});

	it('for the safety case, hosted screening included', () => {
		const agent = { id: AGENT, name: 'Snackbot 3000', goalCardId: 'starter/snack' };
		const capabilities: BotCapabilities = {
			filled: new Set<SlotId>(),
			toolIds: [],
			actionIds: ['move', 'open'],
			channels: [],
			cartridgeId: '',
			notebook: false,
			guardrailIds: ['safety/action-blocklist', 'geap/armor:decision'],
			fingerprint: 'fp'
		};
		const viaSummaries = safetyCaseFromSummaries(
			agent,
			capabilities,
			undefined,
			[],
			runs,
			summaries
		);
		const viaEvents = safetyCaseFor(agent, capabilities, undefined, [], runs, eventsByRun);
		expect(viaSummaries).toEqual(viaEvents);
		expect(viaSummaries.hostedScreening).toEqual({ fired: 1, decisions: 2 });
		expect(viaSummaries.trustworthiness.incidentRuns).toBe(1);
	});
});
