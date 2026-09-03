import { describe, expect, it } from 'vitest';
import { createPackRegistry, type AssertionCard, type EngineEvent } from '@craftabot/core';
import starterPack, { NO_SECRETS_OUT_LOUD, OPENS_THE_CHEST } from '@craftabot/pack-starter';
import { buildSpec, runToCompletion } from '@craftabot/pack-starter/testing';
import { obedient } from '@craftabot/core/testing';
import { evaluateAssertion, runTestBench } from './assertions.js';
import {
	assertionEvaluator,
	evaluateCard,
	evaluationInputFor,
	evaluatorsOf,
	provisionalRun,
	renderCall,
	resolveEvaluator
} from './evaluators.js';

/**
 * WP43 stage B (`31-EVALUATORS.md` §4.2): every assertion card is an
 * evaluator through one adapter, the old path agrees with the new on every
 * built-in card, and `usage-at-least` fires for the first time.
 */

async function openTheChest(): Promise<EngineEvent[]> {
	const run = await runToCompletion({
		spec: buildSpec({ goalCardId: 'starter/say-hello' }),
		script: obedient([
			{ say: 'Off east.', call: 'move', args: { direction: 'east' } },
			{ say: 'Hello!', call: 'say', args: { text: 'Hello Teddy, I am your new robot!' } }
		])
	});
	return run.events;
}

describe('the adapter', () => {
	it('agrees with evaluateAssertion on every built-in starter card, and names its evidence', async () => {
		const events = await openTheChest();
		const input = evaluationInputFor(events);
		for (const card of starterPack.assertionCards ?? []) {
			const old = evaluateAssertion(card, events);
			const fresh = evaluateCard(card, input);
			expect(fresh.verdict === 'pass').toBe(old.pass);
			expect(fresh.evidence.map((row) => row.tick)).toEqual(old.matches.map((m) => m.tick));
			for (const row of fresh.evidence) {
				expect(events.some((event) => event.id === row.eventId)).toBe(true);
				expect(row.note).toBeTruthy();
			}
			expect(fresh.evaluatorId).toBe(card.id);
			expect(assertionEvaluator(card).kind).toBe('deterministic');
		}
		expect(runTestBench(starterPack.assertionCards ?? [], events).map((r) => r.pass)).toEqual([
			true,
			true,
			false
		]);
	});

	it("lets a usage-at-least card fire, from the run's own usage", async () => {
		const events = await openTheChest();
		const spent: AssertionCard = {
			id: 'test/spent-something',
			title: 'Spent at least one tick',
			schemaVersion: 1,
			quantifier: 'at-least-once',
			when: { kind: 'usage-at-least', field: 'ticks', value: 1 }
		};
		const result = evaluateCard(spent, evaluationInputFor(events));
		expect(result.verdict).toBe('pass');
		expect(result.evidence.length).toBeGreaterThan(0);
		const tooMany: AssertionCard = {
			...spent,
			id: 'test/spent-lots',
			when: { kind: 'usage-at-least', field: 'ticks', value: 999 }
		};
		expect(evaluateCard(tooMany, evaluationInputFor(events)).verdict).toBe('fail');
	});

	it('folds a provisional run from the events when none is stored', async () => {
		const events = await openTheChest();
		const run = provisionalRun(events);
		expect(run.outcome).not.toBe('IN_PROGRESS');
		expect(run.ticks).toBeGreaterThan(0);
		expect(run.usage.inputTokens).toBeGreaterThanOrEqual(0);
		expect(provisionalRun([]).outcome).toBe('IN_PROGRESS');
	});

	it('renders a call for the evidence note', () => {
		expect(renderCall('say', { text: 'hi' })).toBe('say(text: hi)');
		expect(renderCall('look', undefined)).toBe('look()');
		expect(renderCall('go', 'north')).toBe('go("north")');
		expect(renderCall('roll', 6)).toBe('roll(6)');
	});
});

describe('evaluators from a registry', () => {
	it('lists shipped evaluators and one adapter per card, and resolves either by id', () => {
		const registry = createPackRegistry();
		registry.registerPack(starterPack);
		const all = evaluatorsOf(registry);
		expect(all.map((e) => e.id)).toContain(NO_SECRETS_OUT_LOUD.id);
		expect(resolveEvaluator(registry, OPENS_THE_CHEST.id)?.name).toBe(OPENS_THE_CHEST.title);
		expect(resolveEvaluator(registry, 'nobody/knows')).toBeUndefined();
	});
});
