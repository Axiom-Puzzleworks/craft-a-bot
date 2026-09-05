import { obedient } from '@craftabot/core/testing';
import { evaluationInputFor } from '@craftabot/governance';
import { describe, expect, it } from 'vitest';
import { adviseCardId } from './decks/goal-cards.js';
import { adviceDesk } from './world/desk.js';
import { buildSpec, runToCompletion } from './testing/harness.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';

/**
 * The desk's five per-case metrics (WP61, `50-…` §4.1), folded over real
 * runs on the Advice Desk: the pushy customer's pressure is withstood by a
 * bot that gathers and recommends, and yielded to by one that executes.
 */
async function events(goalCardId: string, unsafe = false) {
	const plan = unsafe ? adversaryPlanFor(goalCardId) : planFor(goalCardId);
	const run = await runToCompletion({
		script: obedient(plan),
		spec: buildSpec({ goalCardId }),
		maxTicks: plan.length + 1,
		stepLimit: plan.length + 5
	});
	return run.events;
}

const fold = (id: string, over: Parameters<typeof evaluationInputFor>[0]) => {
	const metric = adviceDesk.metrics?.find((entry) => entry.id === id);
	if (!metric) throw new Error(`no metric ${id}`);
	return metric.fold(over, evaluationInputFor(over).truth);
};

describe('the desk’s per-case metrics', () => {
	it('declares the five, named and described', () => {
		expect(adviceDesk.metrics?.map((metric) => metric.id)).toEqual([
			'ticksPerCase',
			'costPerCase',
			'approvalsPerDecision',
			'escalationRate',
			'pressureWithstood'
		]);
		for (const metric of adviceDesk.metrics ?? []) {
			expect(metric.name.length).toBeGreaterThan(0);
			expect(metric.description.length).toBeGreaterThan(0);
		}
	});

	it('ticks, cost and the decision rates read off the run', async () => {
		const optimal = await events(adviseCardId('nothing-suits'));
		expect(fold('ticksPerCase', optimal)).toBe(6);
		expect(fold('costPerCase', optimal)).toBeGreaterThan(0);
		// One queue item, escalated to an adviser: every decision was an escalation, none asked a person.
		expect(fold('escalationRate', optimal)).toBe(1);
		expect(fold('approvalsPerDecision', optimal)).toBe(0);
		// Before anything is decided the rate says nothing.
		expect(fold('escalationRate', [])).toBeUndefined();
		expect(fold('approvalsPerDecision', [])).toBeUndefined();
	});

	it('pressure withstood: the pushy customer’s lines count against a bot that executes, not one that gathers', async () => {
		const gathered = await events(adviseCardId('pushy'));
		const withstood = fold('pressureWithstood', gathered);
		expect(withstood).toBeGreaterThan(0);
		const yielded = await events(adviseCardId('pushy'), true);
		const held = fold('pressureWithstood', yielded);
		// The adversary recommends, is told "Do it now" (0.7), and executes — that line is not withstood.
		expect(held ?? 0).toBeLessThan(withstood ?? 0);
		expect(fold('pressureWithstood', await events(adviseCardId('inheritance')))).toBeDefined();
	});
});
