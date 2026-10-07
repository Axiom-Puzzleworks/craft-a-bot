import { contextSpecFor, createSession, type EngineEvent } from '@craftabot/core';
import { createMockProvider, createTestClock, obedient } from '@craftabot/core/testing';
import { evaluationInputFor, inputReadableBy } from '@craftabot/governance';
import { describe, expect, it } from 'vitest';
import { adviseCardId } from './decks/goal-cards.js';
import { dataMinimised } from './evaluators/deterministic.js';
import { buildRegistry, buildSpec } from './testing/harness.js';
import { planFor } from './testing/plans.js';
import { adviceDesk } from './world/desk.js';

/**
 * **The level is measurable** (WP81, `70-…` §7; `64-…` §6.3.1): the same
 * bot on the plain savings case — `data-minimised` passes at `minimal` and
 * did fail at `relational` while the rung handed an advice bot the bureau summary and
 * a complaint; since `113-…` §12 (item 12) it hands only the accounts and their activity,
 * which the journey has a use for, so on this desk the level is no longer a cost.
 */
const CARD = adviseCardId('rainy-day');
const deps = {
	fetch: () => Promise.reject(new Error('offline')),
	getCredential: () => undefined
};

async function runAt(level: 'minimal' | 'case-file' | 'relational'): Promise<EngineEvent[]> {
	const clock = createTestClock();
	const registry = buildRegistry();
	const card = registry.getGoalCard(CARD)!;
	const world = adviceDesk.create(card.layoutId, {
		random: clock.random,
		config: { context: contextSpecFor(level) }
	});
	const session = createSession({
		spec: buildSpec({ goalCardId: CARD }),
		registry,
		world,
		provider: createMockProvider({ script: obedient(planFor(CARD)) }),
		options: { now: clock.now, newId: clock.newId, random: clock.random }
	});
	const events: EngineEvent[] = [];
	session.events.onAny((event) => events.push(event));
	session.events.on('approval.requested', () => session.resolveApproval(true));
	session.start('step');
	for (let step = 0; step < 40; step += 1) {
		const result = await session.step();
		if (result.outcome) break;
	}
	return events;
}

describe('data-minimised across the context ladder', () => {
	it('passes at minimal and at case-file, and at relational too now it hands over only what advice has a use for, on the plain savings case', async () => {
		const verdictAt = async (level: 'minimal' | 'case-file' | 'relational') => {
			const events = await runAt(level);
			const input = inputReadableBy(dataMinimised, evaluationInputFor(events));
			return dataMinimised.evaluate(input, deps);
		};
		const minimal = await verdictAt('minimal');
		expect(minimal.verdict).toBe('pass');
		const caseFile = await verdictAt('case-file');
		expect(caseFile.verdict).toBe('pass');
		// 113 §12, item 12: the rung hands an advice bot the customer, the accounts and what moves through them, which a
		// recommendation weighs for affordability — not the complaints or the credit file — so nothing it supplies is unneeded.
		const relational = await verdictAt('relational');
		expect(relational.verdict).toBe('pass');
	});

	it('the relational rung hands an advice bot no complaint and no credit file', async () => {
		const events = await runAt('relational');
		const opening = events.find((event) => event.type === 'world.changed');
		const state = (opening?.type === 'world.changed' ? opening.payload.state : {}) as {
			contextRecordIds?: string[];
		};
		const ids = state.contextRecordIds ?? [];
		expect(ids.some((id) => id.startsWith('account-') || id.startsWith('transactions-'))).toBe(
			true
		);
		expect(ids.some((id) => id === 'bureau' || id.startsWith('complaint-'))).toBe(false);
	});

	it('the relational rung is on the desk at tick 0 and in the customer-record sense', async () => {
		const events = await runAt('relational');
		const opening = events.find((event) => event.type === 'world.changed');
		const state = (opening?.type === 'world.changed' ? opening.payload.state : {}) as {
			contextRecordIds?: string[];
			records?: Array<{ id: string; classification?: string }>;
		};
		expect(state.contextRecordIds?.length).toBeGreaterThan(0);
		expect(state.records?.some((record) => record.classification === 'special-category')).toBe(
			false
		);
	});
});
