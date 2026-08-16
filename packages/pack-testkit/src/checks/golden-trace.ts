import {
	createSession,
	safeParseEngineEvent,
	type EngineEvent,
	type PackRegistry
} from '@craftabot/core';
import { createMockProvider, createTestClock } from '@craftabot/core/testing';
import type { ConformanceIssue, GoldenTraceConformanceFixture } from '../types.js';

/**
 * "Golden-trace: a scripted run in the pack's world produces only catalogued
 * event types" (`13-…` §7).
 *
 * Drives a real session — the same registry, the same `createSession`, the
 * same scripted-brain machinery the workbench and `pack-monitor`'s own
 * contract test use — and runs every event that comes out of it through
 * `safeParseEngineEvent`. That function validates against
 * `engineEventSchema` directly, so the catalogue this checks against is
 * derived from the schema itself rather than a hand-copied list — the kind of
 * list that goes stale exactly the way `pack-starter`'s own
 * `trace-fixture.test.ts` did (missing two of the twenty-one event types).
 */
export async function checkGoldenTrace(
	registry: PackRegistry,
	fixture: GoldenTraceConformanceFixture
): Promise<ConformanceIssue[]> {
	const issues: ConformanceIssue[] = [];
	const clock = createTestClock();
	const session = createSession({
		spec: fixture.spec,
		registry,
		provider: createMockProvider({ script: fixture.script }),
		options: { now: clock.now, newId: clock.newId, random: clock.random }
	});

	const events: EngineEvent[] = [];
	session.events.onAny((event) => events.push(event));
	session.events.on('approval.requested', () => session.resolveApproval(true));

	session.start('step');
	let outcome: string | undefined;
	const limit = fixture.maxSteps ?? 40;
	for (let step = 0; step < limit; step++) {
		const result = await session.step();
		if (result.outcome) {
			outcome = result.outcome;
			break;
		}
	}

	if (!outcome) {
		issues.push({
			check: 'golden-trace.terminates',
			message: `run did not reach a terminal outcome within ${limit} steps`
		});
	}

	for (const event of events) {
		const parsed = safeParseEngineEvent(event);
		if (!parsed.success) {
			issues.push({
				check: 'golden-trace.catalogued-events',
				message: `an event of type "${event.type}" does not validate against the event catalogue: ${parsed.error.message}`,
				detail: event
			});
		}
	}

	return issues;
}
